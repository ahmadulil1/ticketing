//! Implementasi remote desktop untuk Windows: capture layar (GDI) + inject
//! input (SendInput).
//!
//! Dipakai dari `remote_stream.rs` (capture) dan `remote_input.rs` (inject).
//! Seluruh file ini hanya di-compile untuk Windows.
//!
//! Catatan batas Windows yang tidak bisa dielakkan:
//! - Layar UAC (secure desktop) tidak bisa ditangkap/dikontrol.
//! - Window yang berjalan sebagai Administrator tidak bisa disuntik input
//!   dari proses biasa (UIPI).

use crate::remote_input::RemoteInput;

/// Lebar maksimum frame (px), sama dengan versi macOS.
pub const FRAME_MAX_WIDTH: u32 = 1280;
/// Kualitas JPEG 0-100.
pub const FRAME_JPEG_QUALITY: u8 = 50;

// ---------------------------------------------------------------------------
// Capture layar
// ---------------------------------------------------------------------------

/// Tangkap layar utama, downscale ke [`FRAME_MAX_WIDTH`], kompres JPEG.
///
/// Return: (bytes JPEG, lebar layar asli px, tinggi layar asli px).
pub fn capture_frame() -> Result<(Vec<u8>, f64, f64), String> {
    use windows::Win32::Foundation::HWND;
    use windows::Win32::Graphics::Gdi::*;
    use windows::Win32::UI::WindowsAndMessaging::{GetSystemMetrics, SM_CXSCREEN, SM_CYSCREEN};

    unsafe {
        let screen_w = GetSystemMetrics(SM_CXSCREEN);
        let screen_h = GetSystemMetrics(SM_CYSCREEN);
        if screen_w <= 0 || screen_h <= 0 {
            return Err("gagal ambil ukuran layar".to_string());
        }

        // Downscale sekali di GDI (StretchBlt) supaya tak perlu resize manual.
        let (dst_w, dst_h) = if screen_w as u32 > FRAME_MAX_WIDTH {
            let scale = FRAME_MAX_WIDTH as f64 / screen_w as f64;
            (
                FRAME_MAX_WIDTH as i32,
                ((screen_h as f64 * scale).round() as i32).max(1),
            )
        } else {
            (screen_w, screen_h)
        };

        // DC dari desktop window = seluruh layar (bukan cuma 1 monitor).
        let hdc_screen = GetDC(HWND(std::ptr::null_mut()));
        if hdc_screen.is_invalid() {
            return Err("GetDC gagal".to_string());
        }
        let mem_dc = CreateCompatibleDC(hdc_screen);
        if mem_dc.is_invalid() {
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("CreateCompatibleDC gagal".to_string());
        }
        let bitmap = CreateCompatibleBitmap(hdc_screen, dst_w, dst_h);
        if bitmap.is_invalid() {
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("CreateCompatibleBitmap gagal".to_string());
        }
        let old_obj = SelectObject(mem_dc, HGDIOBJ(bitmap.0));

        // Salin + resize layar -> bitmap.
        let blt = StretchBlt(
            mem_dc,
            0,
            0,
            dst_w,
            dst_h,
            hdc_screen,
            0,
            0,
            screen_w,
            screen_h,
            SRCCOPY,
        );
        if !blt.as_bool() {
            let _ = SelectObject(mem_dc, old_obj);
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
            let _ = DeleteDC(mem_dc);
            let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);
            return Err("StretchBlt gagal".to_string());
        }

        // Bitmap -> BGRA raw.
        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: dst_w,
                biHeight: -dst_h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            bmiColors: [Default::default(); 1],
        };
        let mut raw = vec![0u8; (dst_w as usize) * (dst_h as usize) * 4];
        let lines = GetDIBits(
            mem_dc,
            bitmap,
            0,
            dst_h as u32,
            Some(raw.as_mut_ptr() as *mut std::ffi::c_void),
            &mut bmi,
            DIB_RGB_COLORS,
        );

        // Bersihkan resource GDI (bukan otomatis — GDI handel harus dibuang).
        let _ = SelectObject(mem_dc, old_obj);
        let _ = DeleteObject(HGDIOBJ(bitmap.0));
        let _ = DeleteDC(mem_dc);
        let _ = ReleaseDC(HWND(std::ptr::null_mut()), hdc_screen);

        if lines == 0 {
            return Err("GetDIBits gagal".to_string());
        }

        // BGRA -> RGB (urutan channel dibalik).
        let mut rgb = Vec::with_capacity((dst_w as usize) * (dst_h as usize) * 3);
        for px in raw.chunks_exact(4) {
            rgb.push(px[2]);
            rgb.push(px[1]);
            rgb.push(px[0]);
        }

        // Encode JPEG.
        let mut jpeg = Vec::with_capacity(200 * 1024);
        let encoder = jpeg_encoder::Encoder::new(&mut jpeg, FRAME_JPEG_QUALITY);
        encoder
            .encode(
                &rgb,
                dst_w as u16,
                dst_h as u16,
                jpeg_encoder::ColorType::Rgb,
            )
            .map_err(|e| format!("encode jpeg gagal: {}", e))?;

        Ok((jpeg, screen_w as f64, screen_h as f64))
    }
}

// ---------------------------------------------------------------------------
// Inject input
// ---------------------------------------------------------------------------

/// Koordinat 0..1 (atau px absolut kalau `norm == false`) -> 0..65535.
/// `MOUSEEVENTF_ABSOLUTE` tanpa `VIRTUALDESK` memakai koordinat monitor utama.
fn to_absolute(x: f64, y: f64, norm: bool, screen_w: f64, screen_h: f64) -> (i32, i32) {
    let (nx, ny) = if norm {
        (x, y)
    } else if screen_w > 0.0 && screen_h > 0.0 {
        (x / screen_w, y / screen_h)
    } else {
        (x, y)
    };
    let nx = nx.clamp(0.0, 1.0);
    let ny = ny.clamp(0.0, 1.0);
    ((nx * 65535.0).round() as i32, (ny * 65535.0).round() as i32)
}

/// Kirim satu set input lewat SendInput.
fn send_inputs(inputs: &[windows::Win32::UI::Input::KeyboardAndMouse::INPUT]) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::SendInput;
    let sent = unsafe {
        SendInput(
            inputs,
            std::mem::size_of::<windows::Win32::UI::Input::KeyboardAndMouse::INPUT>() as i32,
        )
    };
    if sent as usize != inputs.len() {
        return Err("SendInput ditolak Windows (UIPI? app butuh elevated?)".to_string());
    }
    Ok(())
}

fn mouse_input(flags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS, x: i32, y: i32) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    INPUT {
        r#type: INPUT_MOUSE,
        Anonymous: INPUT_0 {
            mi: MOUSEINPUT {
                dx: x,
                dy: y,
                mouseData: 0,
                dwFlags: flags,
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

fn key_input(
    vk: u16,
    up: bool,
) -> windows::Win32::UI::Input::KeyboardAndMouse::INPUT {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;
    INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 {
            ki: KEYBDINPUT {
                wVk: VIRTUAL_KEY(vk),
                wScan: 0,
                dwFlags: if up { KEYEVENTF_KEYUP } else { KEYBD_EVENT_FLAGS(0) },
                time: 0,
                dwExtraInfo: 0,
            },
        },
    }
}

/// Inject satu peristiwa input ke Windows.
pub fn inject(
    input: &RemoteInput,
    screen_w: f64,
    screen_h: f64,
) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::*;

    match input {
        RemoteInput::MouseMove { x, y, norm } => {
            let (ax, ay) = to_absolute(*x, *y, *norm, screen_w, screen_h);
            send_inputs(&[mouse_input(
                MOUSEEVENTF_MOVE | MOUSEEVENTF_ABSOLUTE,
                ax,
                ay,
            )])
        }
        RemoteInput::MouseDown { button, x, y, norm } => {
            let (ax, ay) = to_absolute(*x, *y, *norm, screen_w, screen_h);
            let flag = match button.as_str() {
                "right" => MOUSEEVENTF_RIGHTDOWN,
                "center" | "middle" => MOUSEEVENTF_MIDDLEDOWN,
                _ => MOUSEEVENTF_LEFTDOWN,
            };
            send_inputs(&[mouse_input(flag, ax, ay)])
        }
        RemoteInput::MouseUp { button, x, y, norm } => {
            let (ax, ay) = to_absolute(*x, *y, *norm, screen_w, screen_h);
            let flag = match button.as_str() {
                "right" => MOUSEEVENTF_RIGHTUP,
                "center" | "middle" => MOUSEEVENTF_MIDDLEDOWN,
                _ => MOUSEEVENTF_LEFTUP,
            };
            send_inputs(&[mouse_input(flag, ax, ay)])
        }
        RemoteInput::KeyDown {
            key,
            shift,
            ctrl,
            alt,
            meta,
        } => send_key(key, true, *shift, *ctrl, *alt, *meta),
        RemoteInput::KeyUp {
            key,
            shift,
            ctrl,
            alt,
            meta,
        } => send_key(key, false, *shift, *ctrl, *alt, *meta),
    }
}

/// Tekan/lepas tombol keyboard + modifier-nya.
///
/// Modifier ditekan sebelum tombol utama dan dilepas setelahnya, supaya
/// kombinasi seperti Ctrl+C behave seperti ketikan asli.
fn send_key(key: &str, down: bool, shift: bool, ctrl: bool, alt: bool, meta: bool) -> Result<(), String> {
    use windows::Win32::UI::Input::KeyboardAndMouse::INPUT;

    let mods = modifier_vks(shift, ctrl, alt, meta);
    let mut inputs: Vec<INPUT> = Vec::new();

    if down {
        for vk in &mods {
            inputs.push(key_input(*vk, false));
        }
    }
    let vk = key_to_vk(key);
    if vk != 0 {
        inputs.push(key_input(vk, !down));
    }
    if !down {
        for vk in mods.iter().rev() {
            inputs.push(key_input(*vk, true));
        }
    }

    if inputs.is_empty() {
        return Ok(());
    }
    send_inputs(&inputs)
}

/// VK code untuk modifier: shift, ctrl, alt, meta (Win).
fn modifier_vks(shift: bool, ctrl: bool, alt: bool, meta: bool) -> Vec<u16> {
    let mut v = Vec::new();
    if shift {
        v.push(0x10); // VK_SHIFT
    }
    if ctrl {
        v.push(0x11); // VK_CONTROL
    }
    if alt {
        v.push(0x12); // VK_MENU
    }
    if meta {
        v.push(0x5B); // VK_LWIN
    }
    v
}

/// Map string kunci dari browser (`event.key`) ke VK code Windows.
fn key_to_vk(key: &str) -> u16 {
    let k = key.to_lowercase();
    match k.as_str() {
        "backspace" => 0x08,
        "tab" => 0x09,
        "enter" | "return" => 0x0D,
        "shift" => 0x10,
        "control" | "ctrl" => 0x11,
        "alt" | "option" => 0x12,
        "pause" => 0x13,
        "capslock" => 0x14,
        "escape" | "esc" => 0x1B,
        " " | "space" | "spacebar" => 0x20,
        "pageup" => 0x21,
        "pagedown" => 0x22,
        "end" => 0x23,
        "home" => 0x24,
        "arrowleft" | "left" => 0x25,
        "arrowup" | "up" => 0x26,
        "arrowright" | "right" => 0x27,
        "arrowdown" | "down" => 0x28,
        "insert" => 0x2D,
        "delete" | "del" => 0x2E,
        "meta" | "command" | "cmd" | "os" | "super" | "win" => 0x5B,
        "contextmenu" => 0x5D,
        "printscreen" => 0x2C,
        "scrolllock" => 0x91,
        "numlock" => 0x90,
        "-" | "minus" => 0xBD,
        "=" | "equal" => 0xBB,
        "[" | "bracketleft" => 0xDB,
        "]" | "bracketright" => 0xDD,
        "\\" | "backslash" => 0xDC,
        ";" | "semicolon" => 0xBA,
        "'" | "quote" => 0xDE,
        "," | "comma" => 0xBC,
        "." | "period" => 0xBE,
        "/" | "slash" => 0xBF,
        "`" | "backquote" => 0xC0,
        "volumeup" => 0xAF,
        "volumedown" => 0xAE,
        "mute" => 0xAD,
        _ => {
            // huruf a-z
            let bytes = k.as_bytes();
            if bytes.len() == 1 {
                let c = bytes[0];
                if c.is_ascii_lowercase() {
                    return c.to_ascii_uppercase() as u16;
                }
                if c.is_ascii_digit() {
                    return c as u16;
                }
            }
            // F1-F12
            if let Some(n) = k.strip_prefix('f') {
                if let Ok(n) = n.parse::<u16>() {
                    if (1..=12).contains(&n) {
                        return 0x6F + n;
                    }
                }
            }
            0
        }
    }
}

use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
    Manager,
};

/// Paksa repaint window WebView2.
/// ponytail: WebView2 di sebagian GPU tidak repaint setelah show() dari state hidden,
/// menyebabkan window blank putih / sisa bayangan. Nudge ukuran +1px memicu repaint.
pub fn nudge_repaint(window: &tauri::WebviewWindow) {
    if let Ok(size) = window.outer_size() {
        if size.width > 0 && size.height > 0 {
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: size.height + 1,
            }));
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: size.width,
                height: size.height,
            }));
        }
    }
}

pub fn setup_system_tray(app: &tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    let show_item = MenuItem::with_id(app, "show", "Buka Ticketing", true, None::<&str>)?;
    let show_pet_item = MenuItem::with_id(app, "show-pet", "Tampilkan Pet", true, None::<&str>)?;
    let hide_item = MenuItem::with_id(app, "hide", "Sembunyikan Pet", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Keluar", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show_item, &show_pet_item, &hide_item, &quit_item])?;

    let app_handle = app.handle().clone();
    TrayIconBuilder::new()
        .menu(&menu)
        .icon(app.default_window_icon().unwrap().clone())
        .on_menu_event(move |app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("mini") {
                    let _ = window.show();
                    let _ = window.set_focus();
                    nudge_repaint(&window);
                }
            }            "show-pet" => {
                if let Some(window) = app.get_webview_window("pet-overlay") {
                    let _ = window.show();
                }
            }
            "hide" => {
                if let Some(window) = app.get_webview_window("pet-overlay") {
                    let _ = window.hide();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(move |_, event| {
            if let tauri::tray::TrayIconEvent::Click {
                button: tauri::tray::MouseButton::Left,
                ..
            } = event
            {
                if let Some(window) = app_handle.get_webview_window("mini") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                        nudge_repaint(&window);
                    }
                }
            }
        })
        .build(app)?;

    Ok(())
}

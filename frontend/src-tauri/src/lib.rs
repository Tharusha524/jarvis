//! Native commands the interface calls with `invoke`. They only read status.
//! The AI itself lives in the Python backend, which `backend.rs` starts.

mod backend;

use std::net::{SocketAddr, TcpStream};
use std::sync::Mutex;
use std::time::Duration;

use serde::Serialize;
use sysinfo::{CpuRefreshKind, Disks, MemoryRefreshKind, RefreshKind, System};

const GIGABYTE: f64 = 1_073_741_824.0;
// Well-known public DNS servers, reached over HTTPS's port. Nothing is sent.
const INTERNET_PROBES: [&str; 2] = ["1.1.1.1:443", "8.8.8.8:443"];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemSnapshot {
    cpu_percent: f32,
    memory_used_gb: f64,
    memory_total_gb: f64,
    disk_free_gb: f64,
    disk_total_gb: f64,
    disk_name: String,
}

/// Keeping one `System` alive lets CPU usage be measured between two calls.
struct Monitor(Mutex<System>);

#[tauri::command]
fn get_system_snapshot(monitor: tauri::State<'_, Monitor>) -> Result<SystemSnapshot, String> {
    let mut system = monitor.0.lock().map_err(|_| "System monitor is unavailable")?;
    system.refresh_cpu_usage();
    system.refresh_memory();

    let disks = Disks::new_with_refreshed_list();
    // Prefer the drive JARVIS runs from, which is the one its models use.
    let current_drive = std::env::current_exe()
        .ok()
        .and_then(|path| path.components().next().map(|part| part.as_os_str().to_owned()));
    let disk = disks
        .list()
        .iter()
        .find(|disk| {
            current_drive
                .as_ref()
                .is_some_and(|drive| disk.mount_point().as_os_str().to_string_lossy().starts_with(&*drive.to_string_lossy()))
        })
        .or_else(|| disks.list().first())
        .ok_or("No disk found")?;

    Ok(SystemSnapshot {
        cpu_percent: system.global_cpu_usage(),
        memory_used_gb: system.used_memory() as f64 / GIGABYTE,
        memory_total_gb: system.total_memory() as f64 / GIGABYTE,
        disk_free_gb: disk.available_space() as f64 / GIGABYTE,
        disk_total_gb: disk.total_space() as f64 / GIGABYTE,
        disk_name: disk.mount_point().to_string_lossy().trim_end_matches('\\').to_string(),
    })
}

fn can_connect(address: &str, timeout: Duration) -> bool {
    address
        .parse::<SocketAddr>()
        .map(|socket| TcpStream::connect_timeout(&socket, timeout).is_ok())
        .unwrap_or(false)
}

/// Async so a slow network never freezes the window.
#[tauri::command(async)]
fn check_internet() -> bool {
    INTERNET_PROBES
        .iter()
        .any(|address| can_connect(address, Duration::from_millis(1500)))
}

/// C: is nearly full, so the WebView data goes on D: when that folder exists.
fn use_data_folder_on_d() {
    let tools = std::path::Path::new(r"D:\devtools");
    if tools.exists() {
        std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", tools.join("jarvis-data").join("webview"));
    }
}

pub fn run() {
    use_data_folder_on_d();
    backend::start();

    let system = System::new_with_specifics(
        RefreshKind::nothing()
            .with_cpu(CpuRefreshKind::nothing().with_cpu_usage())
            .with_memory(MemoryRefreshKind::nothing().with_ram()),
    );

    tauri::Builder::default()
        .manage(Monitor(Mutex::new(system)))
        .invoke_handler(tauri::generate_handler![get_system_snapshot, check_internet])
        .run(tauri::generate_context!())
        .expect("JARVIS failed to start");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn refuses_a_bad_address() {
        assert!(!can_connect("not an address", Duration::from_millis(10)));
    }
}

//! Starts the Python backend with the app. The backend watches this process
//! and shuts itself and Ollama down when the app closes or crashes.

use std::net::{SocketAddr, TcpStream};
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::thread;
use std::time::{Duration, Instant};

const BACKEND_ADDRESS: &str = "127.0.0.1:8765";
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// A backend from the last run may still be closing when the app reopens.
const REPLACE_WAIT: Duration = Duration::from_secs(6);

/// Where the backend lives during development. The installer in Milestone 6
/// will supply a packaged backend instead.
fn backend_dir() -> PathBuf {
    match std::env::var_os("JARVIS_BACKEND_DIR") {
        Some(path) => PathBuf::from(path),
        None => Path::new(env!("CARGO_MANIFEST_DIR")).join("../../backend"),
    }
}

fn already_running() -> bool {
    let address: SocketAddr = BACKEND_ADDRESS.parse().expect("valid address");
    TcpStream::connect_timeout(&address, Duration::from_millis(300)).is_ok()
}

/// Returns false when a backend keeps running, such as one started by hand.
fn wait_until_port_is_free() -> bool {
    let started = Instant::now();
    while already_running() {
        if started.elapsed() > REPLACE_WAIT {
            return false;
        }
        thread::sleep(Duration::from_millis(250));
    }
    true
}

fn spawn() {
    let directory = backend_dir();
    let python = directory.join(".venv/Scripts/python.exe");
    if !python.exists() {
        eprintln!("Backend Python not found at {}", python.display());
        return;
    }

    let result = Command::new(python)
        .args(["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", "8765", "--log-level", "warning"])
        .current_dir(directory)
        .env("JARVIS_PARENT_PID", std::process::id().to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();

    if let Err(error) = result {
        eprintln!("Backend failed to start: {error}");
    }
}

/// Runs in the background so a closing backend never delays the window.
pub fn start() {
    thread::spawn(|| {
        if wait_until_port_is_free() {
            spawn();
        }
    });
}
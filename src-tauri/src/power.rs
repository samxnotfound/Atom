//! Prevents system sleep and display dimming while Standby Mode is active
//! (SPEC 5.2 / 11). Uses SetThreadExecutionState with ES_CONTINUOUS.

#[cfg(windows)]
use windows::Win32::System::Power::{
    SetThreadExecutionState, ES_CONTINUOUS, ES_DISPLAY_REQUIRED, ES_SYSTEM_REQUIRED,
};

#[cfg(windows)]
static COUNT: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

/// Acquire/release a "keep awake" token. Reference-counted so overlapping
/// acquire calls are balanced by matching releases.
#[tauri::command]
pub fn prevent_sleep(acquire: bool) {
    #[cfg(not(windows))]
    {
        let _ = acquire;
    }
    #[cfg(windows)]
    {
        use std::sync::atomic::Ordering;
        if acquire {
            if COUNT.fetch_add(1, Ordering::SeqCst) == 0 {
                unsafe {
                    let _ = SetThreadExecutionState(
                        ES_CONTINUOUS | ES_DISPLAY_REQUIRED | ES_SYSTEM_REQUIRED,
                    );
                }
            }
        } else {
            // An unmatched release must not underflow the usize counter: that
            // would leave it at usize::MAX and the next release would never
            // clear ES_CONTINUOUS, keeping the machine awake forever.
            let mut prev = COUNT.load(Ordering::SeqCst);
            loop {
                if prev == 0 {
                    return;
                }
                match COUNT.compare_exchange_weak(
                    prev,
                    prev - 1,
                    Ordering::SeqCst,
                    Ordering::SeqCst,
                ) {
                    Ok(_) => break,
                    Err(actual) => prev = actual,
                }
            }
            if prev == 1 {
                unsafe {
                    let _ = SetThreadExecutionState(ES_CONTINUOUS);
                }
            }
        }
    }
}

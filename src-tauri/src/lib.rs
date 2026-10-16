use serde::{Deserialize, Serialize};

pub mod engine_bridge;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WearSyncPayload {
    pub payload: String,
}

#[tauri::command]
fn is_android() -> bool {
    cfg!(target_os = "android")
}

#[cfg(target_os = "android")]
use std::sync::Mutex;

#[cfg(target_os = "android")]
static JAVA_VM: Mutex<Option<jni::JavaVM>> = Mutex::new(None);

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_MainActivity_nativeInitJni(
    env: *mut jni::sys::JNIEnv,
    _class: jni::sys::jclass,
) {
    let jni_env = match jni::JNIEnv::from_raw(env) {
        Ok(e) => e,
        Err(e) => {
            println!(
                "[Tauri Rust] nativeInitJni: JNIEnv::from_raw failed: {:?}",
                e
            );
            return;
        }
    };

    match jni_env.get_java_vm() {
        Ok(vm) => {
            if let Ok(mut guard) = JAVA_VM.lock() {
                *guard = Some(vm);
                println!("[Tauri Rust] nativeInitJni: JavaVM stored successfully!");
            }
        }
        Err(e) => {
            println!("[Tauri Rust] nativeInitJni: get_java_vm failed: {:?}", e);
        }
    }
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn JNI_OnLoad(
    vm: *mut jni::sys::JavaVM,
    _reserved: *mut std::ffi::c_void,
) -> jni::sys::jint {
    if !vm.is_null() {
        if let Ok(vm_obj) = jni::JavaVM::from_raw(vm) {
            if let Ok(mut guard) = JAVA_VM.lock() {
                *guard = Some(vm_obj);
                println!("[Tauri Rust] JNI_OnLoad: JavaVM initialized successfully!");
            }
        }
    }
    jni::sys::JNI_VERSION_1_6
}

#[cfg(target_os = "android")]
fn call_kotlin_broadcast(payload: &str) {
    let vm_guard = match JAVA_VM.lock() {
        Ok(g) => g,
        Err(e) => {
            println!("[Tauri Rust] JAVA_VM lock error: {:?}", e);
            return;
        }
    };

    let fallback_vm: jni::JavaVM;
    let vm: &jni::JavaVM = match vm_guard.as_ref() {
        Some(v) => v,
        None => {
            // Fallback: try ndk_context if JNI_OnLoad wasn't called yet
            let ctx = ndk_context::android_context();
            let vm_ptr: *mut std::ffi::c_void = ctx.vm().cast();
            if vm_ptr.is_null() {
                println!("[Tauri Rust] JAVA_VM and ndk_context vm_ptr are both NULL!");
                return;
            }
            match unsafe { jni::JavaVM::from_raw(vm_ptr as *mut _) } {
                Ok(v) => {
                    println!("[Tauri Rust] Obtained JavaVM from ndk_context fallback!");
                    fallback_vm = v;
                    &fallback_vm
                }
                Err(e) => {
                    println!(
                        "[Tauri Rust] JavaVM::from_raw failed from ndk_context: {:?}",
                        e
                    );
                    return;
                }
            }
        }
    };

    unsafe {
        let mut env_guard = match vm.attach_current_thread() {
            Ok(e) => e,
            Err(e) => {
                println!("[Tauri Rust] JNI attach_current_thread failed: {:?}", e);
                return;
            }
        };
        let env = &mut *env_guard;

        let target_cls = match env.find_class("com/poolpoker/app/MainActivity") {
            Ok(c) => c,
            Err(e) => {
                println!(
                    "[Tauri Rust] JNI find_class com/poolpoker/app/MainActivity failed: {:?}",
                    e
                );
                if env.exception_check().unwrap_or(false) {
                    let _ = env.exception_clear();
                }
                return;
            }
        };

        let j_str: jni::objects::JString = match env.new_string(payload) {
            Ok(s) => s,
            Err(e) => {
                println!("[Tauri Rust] JNI payload string failed: {:?}", e);
                return;
            }
        };

        let res = env.call_static_method(
            target_cls,
            "onNativeSyncWearState",
            "(Ljava/lang/String;)V",
            &[(&j_str).into()],
        );

        if let Err(e) = res {
            println!("[Tauri Rust] JNI onNativeSyncWearState error: {:?}", e);
            if env.exception_check().unwrap_or(false) {
                let _ = env.exception_clear();
            }
        } else {
            println!("[Tauri Rust] Successfully invoked MainActivity.onNativeSyncWearState!");
        }
    }
}

#[tauri::command]
fn sync_wear_state(payload: String) -> Result<(), String> {
    #[cfg(target_os = "ios")]
    unsafe {
        unsafe extern "C" {
            fn poolpoker_watch_sync(bytes: *const u8, length: usize);
        }
        poolpoker_watch_sync(payload.as_ptr(), payload.len());
    }
    #[cfg(target_os = "android")]
    {
        println!(
            "[Tauri Rust] Syncing state to Wear OS: {} bytes",
            payload.len()
        );
        call_kotlin_broadcast(&payload);
    }
    let _ = payload;
    Ok(())
}

use std::sync::Mutex as StdMutex;
use tauri::{AppHandle, Emitter, State};

pub struct BleAppState {
    pub engine: StdMutex<Option<engine_bridge::LocalGameEngine>>,
    pub self_user_id: StdMutex<String>,
    pub current_room_code: StdMutex<String>,
}

impl Default for BleAppState {
    fn default() -> Self {
        Self {
            engine: StdMutex::new(None),
            self_user_id: StdMutex::new(String::new()),
            current_room_code: StdMutex::new(String::new()),
        }
    }
}

#[tauri::command]
fn ble_start_host(
    app: AppHandle,
    state: State<'_, BleAppState>,
    host_user_id: String,
    host_name: String,
    room_code: String,
) -> Result<(), String> {
    let engine = engine_bridge::LocalGameEngine::new()?;
    engine.init_room(&host_user_id, &host_name, &room_code)?;

    let bytes = engine.get_ble_binary_state(&host_user_id)?;
    *state.engine.lock().unwrap() = Some(engine);
    *state.self_user_id.lock().unwrap() = host_user_id;
    *state.current_room_code.lock().unwrap() = room_code;

    app.emit("ble://state_updated", bytes)
        .map_err(|e| format!("Failed to emit ble state: {:?}", e))?;
    Ok(())
}

#[tauri::command]
fn ble_connect_host(
    app: AppHandle,
    state: State<'_, BleAppState>,
    user_id: String,
    name: String,
    room_code: String,
) -> Result<(), String> {
    let guard = state.engine.lock().unwrap();
    if let Some(ref engine) = *guard {
        *state.self_user_id.lock().unwrap() = user_id.clone();
        *state.current_room_code.lock().unwrap() = room_code;
        // 如果本机当前运行着 Host，直接将该玩家注册进房间
        engine.add_player(&user_id, &name)?;
        let bytes = engine.get_ble_binary_state(&user_id)?;
        app.emit("ble://state_updated", bytes)
            .map_err(|e| format!("Failed to emit ble state: {:?}", e))?;
        Ok(())
    } else {
        Err("当前未检测到本机离线房间。离线本地对战模式当前仅支持房主在本机创建开局；跨设备从机蓝牙广播扫描与联机功能正在适配中。".to_string())
    }
}

#[tauri::command]
fn ble_rejoin_room(
    app: AppHandle,
    state: State<'_, BleAppState>,
    room_code: String,
    user_id: String,
) -> Result<Vec<u8>, String> {
    let guard = state.engine.lock().unwrap();
    if let Some(ref engine) = *guard {
        let current_code = state.current_room_code.lock().unwrap().clone();
        if current_code == room_code {
            *state.self_user_id.lock().unwrap() = user_id.clone();
            let bytes = engine.get_ble_binary_state(&user_id)?;
            app.emit("ble://state_updated", bytes.clone())
                .map_err(|e| format!("Failed to emit ble state: {:?}", e))?;
            return Ok(bytes);
        }
    }
    Err("本地房间不存在或已结束".to_string())
}

#[tauri::command]
fn ble_send_action(
    app: AppHandle,
    state: State<'_, BleAppState>,
    payload: Vec<u8>,
    card_id: Option<String>,
    target_user_id: Option<String>,
) -> Result<(), String> {
    let guard = state.engine.lock().unwrap();
    if let Some(ref engine) = *guard {
        if payload.len() >= 4 {
            let action_type = payload[3];
            let self_user = state.self_user_id.lock().unwrap().clone();
            let c_id = card_id.unwrap_or_default();
            let t_user = target_user_id.unwrap_or_else(|| self_user.clone());

            let cmd_json = match action_type {
                1 => format!(r#"{{"type":"start_game","actorUserId":"{}"}}"#, self_user),
                2 => {
                    let ball = payload.get(4).copied().unwrap_or(0);
                    let card_idx = payload.get(5).copied().unwrap_or(0);
                    format!(
                        r#"{{"type":"pocket_ball","actorUserId":"{}","cardId":"{}","ballNumber":{},"cardIndex":{}}}"#,
                        self_user, c_id, ball, card_idx
                    )
                }
                3 => format!(r#"{{"type":"draw_penalty","actorUserId":"{}"}}"#, self_user),
                4 => {
                    let ball = payload.get(4).copied().unwrap_or(0);
                    format!(r#"{{"type":"accidental_pocket","ballNumber":{}}}"#, ball)
                }
                5 => {
                    let ball = payload.get(4).copied().unwrap_or(0);
                    format!(r#"{{"type":"break_pocket","ballNumber":{}}}"#, ball)
                }
                6 => r#"{"type":"retract_ball"}"#.to_string(),
                7 => format!(r#"{{"type":"restart_game","actorUserId":"{}"}}"#, self_user),
                8 => {
                    let ball = payload.get(4).copied().unwrap_or(0);
                    format!(
                        r#"{{"type":"referee_pocket_ball","targetUserId":"{}","ballNumber":{}}}"#,
                        t_user, ball
                    )
                }
                9 => format!(
                    r#"{{"type":"referee_draw_penalty","targetUserId":"{}"}}"#,
                    t_user
                ),
                10 => {
                    let count = payload.get(6).copied().unwrap_or(5);
                    format!(
                        r#"{{"type":"update_settings","actorUserId":"{}","cardsPerPlayer":{}}}"#,
                        self_user, count
                    )
                }
                11 => format!(
                    r#"{{"type":"kick_player","actorUserId":"{}","targetUserId":"{}"}}"#,
                    self_user, t_user
                ),
                _ => return Ok(()),
            };

            let _ = engine.handle_command(&cmd_json)?;
            let updated_bytes = engine.get_ble_binary_state(&self_user)?;
            app.emit("ble://state_updated", updated_bytes)
                .map_err(|e| format!("Failed to emit ble state: {:?}", e))?;
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(BleAppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            is_android,
            sync_wear_state,
            ble_start_host,
            ble_connect_host,
            ble_rejoin_room,
            ble_send_action
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

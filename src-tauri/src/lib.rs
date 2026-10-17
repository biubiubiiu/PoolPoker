use serde::{Deserialize, Serialize};
use std::sync::Mutex as StdMutex;
use tauri::{AppHandle, Emitter};

static APP_HANDLE: StdMutex<Option<AppHandle>> = StdMutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WearSyncPayload {
    pub payload: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BleDiscoveredRoom {
    pub device_id: String,
    pub room_code: String,
    pub name: String,
    pub rssi: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlePeerEvent {
    pub peer_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BleCommandEvent {
    pub peer_id: String,
    pub payload: Vec<u8>,
}

#[tauri::command]
fn is_android() -> bool {
    cfg!(target_os = "android")
}

// -------------------------------------------------------------
// Android JNI 环境与 Wear 状态同步
// -------------------------------------------------------------

#[cfg(target_os = "android")]
use std::sync::Mutex;

#[cfg(target_os = "android")]
static JAVA_VM: Mutex<Option<jni::JavaVM>> = Mutex::new(None);

#[cfg(target_os = "android")]
static MAIN_ACTIVITY_CLASS: Mutex<Option<jni::objects::GlobalRef>> = Mutex::new(None);

#[cfg(target_os = "android")]
static BLE_MESH_CLASS: Mutex<Option<jni::objects::GlobalRef>> = Mutex::new(None);

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_MainActivity_nativeInitJni(
    env: *mut jni::sys::JNIEnv,
    _class: jni::sys::jclass,
) {
    let mut jni_env = match jni::JNIEnv::from_raw(env) {
        Ok(e) => e,
        Err(e) => {
            println!("[Tauri Rust] nativeInitJni: JNIEnv::from_raw failed: {:?}", e);
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

    if let Ok(cls) = jni_env.find_class("com/poolpoker/app/MainActivity") {
        if let Ok(global_ref) = jni_env.new_global_ref(cls) {
            if let Ok(mut guard) = MAIN_ACTIVITY_CLASS.lock() {
                *guard = Some(global_ref);
            }
        }
    } else {
        let _ = jni_env.exception_clear();
    }

    if let Ok(cls) = jni_env.find_class("com/poolpoker/app/BleMeshManager") {
        if let Ok(global_ref) = jni_env.new_global_ref(cls) {
            if let Ok(mut guard) = BLE_MESH_CLASS.lock() {
                *guard = Some(global_ref);
                println!("[Tauri Rust] nativeInitJni: BleMeshManager GlobalRef cached!");
            }
        }
    } else {
        let _ = jni_env.exception_clear();
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
fn with_android_class<F>(
    cached_class: &Mutex<Option<jni::objects::GlobalRef>>,
    class_name: &str,
    f: F,
) where
    F: FnOnce(&mut jni::JNIEnv, jni::objects::JClass),
{
    let vm_guard = match JAVA_VM.lock() {
        Ok(g) => g,
        Err(_) => return,
    };

    let fallback_vm: jni::JavaVM;
    let vm: &jni::JavaVM = match vm_guard.as_ref() {
        Some(v) => v,
        None => {
            let ctx = ndk_context::android_context();
            let vm_ptr: *mut std::ffi::c_void = ctx.vm().cast();
            if vm_ptr.is_null() {
                return;
            }
            match unsafe { jni::JavaVM::from_raw(vm_ptr as *mut _) } {
                Ok(v) => {
                    fallback_vm = v;
                    &fallback_vm
                }
                Err(_) => return,
            }
        }
    };

    unsafe {
        let mut env_guard = match vm.attach_current_thread() {
            Ok(e) => e,
            Err(_) => return,
        };
        let env = &mut *env_guard;

        let target_cls: jni::objects::JClass = {
            let cached_raw = cached_class
                .lock()
                .ok()
                .and_then(|g| g.as_ref().map(|r| r.as_raw()));
            if let Some(raw) = cached_raw {
                jni::objects::JClass::from_raw(raw)
            } else {
                match env.find_class(class_name) {
                    Ok(c) => c,
                    Err(_) => {
                        let _ = env.exception_clear();
                        return;
                    }
                }
            }
        };

        f(env, target_cls);
        if env.exception_check().unwrap_or(false) {
            let _ = env.exception_describe();
            let _ = env.exception_clear();
        }
    }
}

#[cfg(target_os = "android")]
fn call_kotlin_broadcast(payload: &str) {
    with_android_class(
        &MAIN_ACTIVITY_CLASS,
        "com/poolpoker/app/MainActivity",
        |env, target_cls| {
            if let Ok(j_str) = env.new_string(payload) {
                let _ = env.call_static_method(
                    target_cls,
                    "onNativeSyncWearState",
                    "(Ljava/lang/String;)V",
                    &[(&j_str).into()],
                );
            }
        },
    );
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
        call_kotlin_broadcast(&payload);
    }
    let _ = payload;
    Ok(())
}

// -------------------------------------------------------------
// BLE 统一跨平台 Tauri Commands
// -------------------------------------------------------------

#[tauri::command]
fn ble_start_advertising(room_code: String, host_name: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                if let (Ok(j_code), Ok(j_name)) =
                    (env.new_string(&room_code), env.new_string(&host_name))
                {
                    let _ = env.call_static_method(
                        cls,
                        "startAdvertising",
                        "(Ljava/lang/String;Ljava/lang/String;)V",
                        &[(&j_code).into(), (&j_name).into()],
                    );
                }
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_start_advertising(code: *const std::os::raw::c_char, name: *const std::os::raw::c_char);
        }
        let c_code = std::ffi::CString::new(room_code.as_str()).unwrap();
        let c_name = std::ffi::CString::new(host_name.as_str()).unwrap();
        poolpoker_ble_start_advertising(c_code.as_ptr(), c_name.as_ptr());
    }

    let _ = (room_code, host_name);
    Ok(())
}

#[tauri::command]
fn ble_stop_advertising() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                let _ = env.call_static_method(cls, "stopAdvertising", "()V", &[]);
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_stop_advertising();
        }
        poolpoker_ble_stop_advertising();
    }

    Ok(())
}

#[tauri::command]
fn ble_start_scanning() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                let _ = env.call_static_method(cls, "startScanning", "()V", &[]);
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_start_scanning();
        }
        poolpoker_ble_start_scanning();
    }

    Ok(())
}

#[tauri::command]
fn ble_stop_scanning() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                let _ = env.call_static_method(cls, "stopScanning", "()V", &[]);
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_stop_scanning();
        }
        poolpoker_ble_stop_scanning();
    }

    Ok(())
}

#[tauri::command]
fn ble_connect_peripheral(device_id: String) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                if let Ok(j_dev) = env.new_string(&device_id) {
                    let _ = env.call_static_method(
                        cls,
                        "connectPeripheral",
                        "(Ljava/lang/String;)V",
                        &[(&j_dev).into()],
                    );
                }
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_connect(device_id: *const std::os::raw::c_char);
        }
        let c_dev = std::ffi::CString::new(device_id.as_str()).unwrap();
        poolpoker_ble_connect(c_dev.as_ptr());
    }

    let _ = device_id;
    Ok(())
}

#[tauri::command]
fn ble_disconnect_peripheral() -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                let _ = env.call_static_method(cls, "disconnectPeripheral", "()V", &[]);
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_disconnect();
        }
        poolpoker_ble_disconnect();
    }

    Ok(())
}

#[tauri::command]
fn ble_send_command_to_host(payload: Vec<u8>) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                if let Ok(j_arr) = env.byte_array_from_slice(&payload) {
                    let _ = env.call_static_method(
                        cls,
                        "sendCommandToHost",
                        "([B)V",
                        &[(&j_arr).into()],
                    );
                }
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_send_command(bytes: *const u8, len: usize);
        }
        poolpoker_ble_send_command(payload.as_ptr(), payload.len());
    }

    let _ = payload;
    Ok(())
}

#[tauri::command]
fn ble_notify_state_to_clients(
    payload: Vec<u8>,
    target_peer_id: Option<String>,
) -> Result<(), String> {
    #[cfg(target_os = "android")]
    {
        with_android_class(
            &BLE_MESH_CLASS,
            "com/poolpoker/app/BleMeshManager",
            |env, cls| {
                if let Ok(j_arr) = env.byte_array_from_slice(&payload) {
                    let j_target = target_peer_id
                        .as_deref()
                        .and_then(|t| env.new_string(t).ok());
                    let target_null = jni::objects::JObject::null();
                    let target_val = match j_target {
                        Some(ref s) => s.into(),
                        None => (&target_null).into(),
                    };
                    let _ = env.call_static_method(
                        cls,
                        "notifyClients",
                        "([BLjava/lang/String;)V",
                        &[(&j_arr).into(), target_val],
                    );
                }
            },
        );
    }

    #[cfg(target_os = "ios")]
    unsafe {
        extern "C" {
            fn poolpoker_ble_notify_clients(
                bytes: *const u8,
                len: usize,
                target_peer_id: *const std::os::raw::c_char,
            );
        }
        let c_target = target_peer_id
            .as_ref()
            .and_then(|s| std::ffi::CString::new(s.as_str()).ok());
        let target_ptr = c_target
            .as_ref()
            .map(|c| c.as_ptr())
            .unwrap_or(std::ptr::null());
        poolpoker_ble_notify_clients(payload.as_ptr(), payload.len(), target_ptr);
    }

    let _ = payload;
    let _ = target_peer_id;
    Ok(())
}

// -------------------------------------------------------------
// 原生 BLE 事件中继 -> 抛给前端 Webview
// -------------------------------------------------------------

fn emit_ble_event<S: Serialize + Clone>(event: &str, payload: S) {
    if let Ok(guard) = APP_HANDLE.lock() {
        if let Some(ref app) = *guard {
            let _ = app.emit(event, payload);
        }
    }
}

// Android JNI Callbacks
#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnDiscoveredRoom(
    mut env: jni::JNIEnv,
    _class: jni::sys::jclass,
    device_id: jni::objects::JString,
    room_code: jni::objects::JString,
    name: jni::objects::JString,
    rssi: jni::sys::jint,
) {
    let d_id: String = env.get_string(&device_id).map(|s| s.into()).unwrap_or_default();
    let r_code: String = env.get_string(&room_code).map(|s| s.into()).unwrap_or_default();
    let n: String = env.get_string(&name).map(|s| s.into()).unwrap_or_default();
    emit_ble_event("ble://discovered_room", BleDiscoveredRoom {
        device_id: d_id,
        room_code: r_code,
        name: n,
        rssi,
    });
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnClientConnected(
    mut env: jni::JNIEnv,
    _class: jni::sys::jclass,
    peer_id: jni::objects::JString,
) {
    let p_id: String = env.get_string(&peer_id).map(|s| s.into()).unwrap_or_default();
    emit_ble_event("ble://client_connected", BlePeerEvent { peer_id: p_id });
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnClientDisconnected(
    mut env: jni::JNIEnv,
    _class: jni::sys::jclass,
    peer_id: jni::objects::JString,
) {
    let p_id: String = env.get_string(&peer_id).map(|s| s.into()).unwrap_or_default();
    emit_ble_event("ble://client_disconnected", BlePeerEvent { peer_id: p_id });
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnCommandReceived(
    mut env: jni::JNIEnv,
    _class: jni::sys::jclass,
    peer_id: jni::objects::JString,
    payload: jni::objects::JByteArray,
) {
    let p_id: String = env.get_string(&peer_id).map(|s| s.into()).unwrap_or_default();
    let mut bytes = Vec::new();
    if !payload.as_raw().is_null() {
        if let Ok(elements) = env.convert_byte_array(&payload) {
            bytes = elements;
        }
    }
    emit_ble_event("ble://command_received", BleCommandEvent {
        peer_id: p_id,
        payload: bytes,
    });
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnStateReceived(
    env: jni::JNIEnv,
    _class: jni::sys::jclass,
    payload: jni::objects::JByteArray,
) {
    let mut bytes = Vec::new();
    if !payload.as_raw().is_null() {
        if let Ok(elements) = env.convert_byte_array(&payload) {
            bytes = elements;
        }
    }
    emit_ble_event("ble://state_received", bytes);
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnPeripheralConnected(
    mut env: jni::JNIEnv,
    _class: jni::sys::jclass,
    device_id: jni::objects::JString,
) {
    let d_id: String = env.get_string(&device_id).map(|s| s.into()).unwrap_or_default();
    emit_ble_event("ble://peripheral_connected", BlePeerEvent { peer_id: d_id });
}

#[cfg(target_os = "android")]
#[no_mangle]
pub unsafe extern "C" fn Java_com_poolpoker_app_BleMeshManager_nativeOnPeripheralDisconnected(
    mut env: jni::JNIEnv,
    _class: jni::sys::jclass,
    device_id: jni::objects::JString,
) {
    let d_id: String = env.get_string(&device_id).map(|s| s.into()).unwrap_or_default();
    emit_ble_event("ble://peripheral_disconnected", BlePeerEvent { peer_id: d_id });
}

// iOS C-ABI Callbacks
#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_discovered_room(
    device_id: *const std::os::raw::c_char,
    room_code: *const std::os::raw::c_char,
    name: *const std::os::raw::c_char,
    rssi: i32,
) {
    let d_id = std::ffi::CStr::from_ptr(device_id).to_string_lossy().to_string();
    let r_code = std::ffi::CStr::from_ptr(room_code).to_string_lossy().to_string();
    let n = std::ffi::CStr::from_ptr(name).to_string_lossy().to_string();
    emit_ble_event("ble://discovered_room", BleDiscoveredRoom {
        device_id: d_id,
        room_code: r_code,
        name: n,
        rssi,
    });
}

#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_command_received(
    peer_id: *const std::os::raw::c_char,
    bytes: *const u8,
    len: usize,
) {
    let p_id = std::ffi::CStr::from_ptr(peer_id).to_string_lossy().to_string();
    let slice = std::slice::from_raw_parts(bytes, len);
    emit_ble_event("ble://command_received", BleCommandEvent {
        peer_id: p_id,
        payload: slice.to_vec(),
    });
}

#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_state_received(
    bytes: *const u8,
    len: usize,
) {
    let slice = std::slice::from_raw_parts(bytes, len);
    emit_ble_event("ble://state_received", slice.to_vec());
}

#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_peripheral_connected(
    device_id: *const std::os::raw::c_char,
) {
    let d_id = std::ffi::CStr::from_ptr(device_id).to_string_lossy().to_string();
    emit_ble_event("ble://peripheral_connected", BlePeerEvent { peer_id: d_id });
}

#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_peripheral_disconnected(
    device_id: *const std::os::raw::c_char,
) {
    let d_id = std::ffi::CStr::from_ptr(device_id).to_string_lossy().to_string();
    emit_ble_event("ble://peripheral_disconnected", BlePeerEvent { peer_id: d_id });
}

#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_client_connected(
    peer_id: *const std::os::raw::c_char,
) {
    let p_id = std::ffi::CStr::from_ptr(peer_id).to_string_lossy().to_string();
    emit_ble_event("ble://client_connected", BlePeerEvent { peer_id: p_id });
}

#[no_mangle]
pub unsafe extern "C" fn poolpoker_on_ble_client_disconnected(
    peer_id: *const std::os::raw::c_char,
) {
    let p_id = std::ffi::CStr::from_ptr(peer_id).to_string_lossy().to_string();
    emit_ble_event("ble://client_disconnected", BlePeerEvent { peer_id: p_id });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if let Ok(mut guard) = APP_HANDLE.lock() {
                *guard = Some(app.handle().clone());
            }
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            is_android,
            sync_wear_state,
            ble_start_advertising,
            ble_stop_advertising,
            ble_start_scanning,
            ble_stop_scanning,
            ble_connect_peripheral,
            ble_disconnect_peripheral,
            ble_send_command_to_host,
            ble_notify_state_to_clients
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

use serde::{Deserialize, Serialize};

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

#[tauri::command]
fn save_auth_token(server: String, token: String) -> Result<(), String> {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        use security_framework::passwords::{delete_generic_password, set_generic_password};
        if token.is_empty() { let _ = delete_generic_password("com.poolpoker.auth", &server); return Ok(()); }
        return set_generic_password("com.poolpoker.auth", &server, token.as_bytes()).map_err(|e| e.to_string());
    }
    #[cfg(target_os = "android")]
    { android_auth(&server, Some(&token)).map(|_| ()) }
    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
    { let _ = (server, token); Err("Native secure token storage is not available on this platform".into()) }
}

#[tauri::command]
fn load_auth_token(server: String) -> Result<String, String> {
    #[cfg(any(target_os = "macos", target_os = "ios"))]
    {
        use security_framework::passwords::get_generic_password;
        return match get_generic_password("com.poolpoker.auth", &server) {
            Ok(bytes) => String::from_utf8(bytes).map_err(|e| e.to_string()),
            Err(e) if e.code() == -25300 => Ok(String::new()),
            Err(e) => Err(e.to_string()),
        };
    }
    #[cfg(target_os = "android")]
    { android_auth(&server, None) }
    #[cfg(not(any(target_os = "macos", target_os = "ios", target_os = "android")))]
    { let _ = server; Err("Native secure token storage is not available on this platform".into()) }
}

#[cfg(target_os = "android")]
fn android_auth(server: &str, token: Option<&str>) -> Result<String, String> {
    let guard = JAVA_VM.lock().map_err(|e| e.to_string())?;
    let vm = guard.as_ref().ok_or("Android runtime not ready")?;
    let mut env = vm.attach_current_thread().map_err(|e| e.to_string())?;
    // Resolve the application class through the Activity's class loader on Rust threads.
    let context = ndk_context::android_context();
    let activity = unsafe { jni::objects::JObject::from_raw(context.context().cast()) };
    let loader = env.call_method(&activity, "getClassLoader", "()Ljava/lang/ClassLoader;", &[]).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;
    let name = env.new_string("com.poolpoker.app.MainActivity").map_err(|e| e.to_string())?;
    let class = env.call_method(loader, "loadClass", "(Ljava/lang/String;)Ljava/lang/Class;", &[(&name).into()]).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;
    let class = jni::objects::JClass::from(class);
    let account = env.new_string(server).map_err(|e| e.to_string())?;
    if let Some(value) = token {
        let secret = env.new_string(value).map_err(|e| e.to_string())?;
        env.call_static_method(class, "saveAuthToken", "(Ljava/lang/String;Ljava/lang/String;)V", &[(&account).into(), (&secret).into()]).map_err(|e| e.to_string())?;
        Ok(String::new())
    } else {
        let result = env.call_static_method(class, "loadAuthToken", "(Ljava/lang/String;)Ljava/lang/String;", &[(&account).into()]).map_err(|e| e.to_string())?.l().map_err(|e| e.to_string())?;
        let text = jni::objects::JString::from(result);
        let value: String = env.get_string(&text).map_err(|e| e.to_string())?.into();
        Ok(value)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![is_android, sync_wear_state, save_auth_token, load_auth_token])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

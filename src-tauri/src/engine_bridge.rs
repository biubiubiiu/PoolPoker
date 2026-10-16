use rquickjs::{Context, Function, Object, Runtime};
use std::sync::Mutex;

static BUNDLE_JS: &str = include_str!("../engine.bundle.js");

#[allow(dead_code)]
pub struct LocalGameEngine {
    runtime: Runtime,
    context: Context,
}

unsafe impl Send for LocalGameEngine {}

#[allow(dead_code)]
pub struct SafeGameEngine(Mutex<LocalGameEngine>);

impl LocalGameEngine {
    pub fn new() -> Result<Self, String> {
        let runtime = Runtime::new().map_err(|e| format!("Failed to create QuickJS runtime: {:?}", e))?;
        let context = Context::full(&runtime).map_err(|e| format!("Failed to create QuickJS context: {:?}", e))?;

        context.with(|ctx| -> Result<(), String> {
            let global = ctx.globals();

            // 1. 向 QuickJS 注入基于 getrandom 系统级 CSPRNG 的 crypto.getRandomValues
            let native_random = Function::new(ctx.clone(), |len: usize| -> Result<Vec<u8>, rquickjs::Error> {
                let mut buf = vec![0u8; len];
                getrandom::getrandom(&mut buf).map_err(|_| rquickjs::Error::Unknown)?;
                Ok(buf)
            }).map_err(|e| format!("Failed to create native_random fn: {:?}", e))?;

            global.set("__nativeGetRandom", native_random)
                .map_err(|e| format!("Failed to set __nativeGetRandom: {:?}", e))?;

            ctx.eval::<(), _>(r#"
                // 1. 标准 Web Crypto getRandomValues 实现 (支持任意 TypedArray 与 byteOffset/byteLength)
                globalThis.crypto = {
                    getRandomValues: function(arr) {
                        if (!arr) return arr;
                        var byteLength = arr.byteLength;
                        if (typeof byteLength === 'number' && byteLength > 0) {
                            var bytes = globalThis.__nativeGetRandom(byteLength);
                            var uint8 = new Uint8Array(arr.buffer, arr.byteOffset || 0, byteLength);
                            for (var i = 0; i < byteLength; i++) {
                                uint8[i] = bytes[i];
                            }
                        }
                        return arr;
                    }
                };

                // 2. TextEncoder / TextDecoder Polyfill (防止 QuickJS 无原生支持)
                if (typeof TextEncoder === 'undefined') {
                    globalThis.TextEncoder = function() {};
                    globalThis.TextEncoder.prototype.encode = function(str) {
                        var bytes = [];
                        for (var i = 0; i < str.length; i++) {
                            var c = str.charCodeAt(i);
                            if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
                                var next = str.charCodeAt(i + 1);
                                if (next >= 0xdc00 && next <= 0xdfff) {
                                    c = ((c - 0xd800) << 10) + (next - 0xdc00) + 0x10000;
                                    i++;
                                }
                            }
                            if (c < 0x80) bytes.push(c);
                            else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
                            else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
                            else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 0x3f), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
                        }
                        return new Uint8Array(bytes);
                    };
                }

                if (typeof TextDecoder === 'undefined') {
                    globalThis.TextDecoder = function() {};
                    globalThis.TextDecoder.prototype.decode = function(bytes) {
                        var str = '';
                        var i = 0;
                        while (i < bytes.length) {
                            var b1 = bytes[i++];
                            if (b1 < 0x80) str += String.fromCharCode(b1);
                            else if (b1 >= 0xc0 && b1 < 0xe0) {
                                var b2 = bytes[i++];
                                str += String.fromCharCode(((b1 & 0x1f) << 6) | (b2 & 0x3f));
                            } else if (b1 >= 0xe0 && b1 < 0xf0) {
                                var b2 = bytes[i++];
                                var b3 = bytes[i++];
                                str += String.fromCharCode(((b1 & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f));
                            } else if (b1 >= 0xf0) {
                                var b2 = bytes[i++];
                                var b3 = bytes[i++];
                                var b4 = bytes[i++];
                                var cp = ((b1 & 0x07) << 18) | ((b2 & 0x3f) << 12) | ((b3 & 0x3f) << 6) | (b4 & 0x3f);
                                cp -= 0x10000;
                                str += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
                            }
                        }
                        return str;
                    };
                }
            "#).map_err(|e| format!("Failed to setup crypto/text polyfills: {:?}", e))?;

            // 2. 加载状态机 Bundle
            ctx.eval::<(), _>(BUNDLE_JS)
                .map_err(|e| format!("Failed to evaluate engine.bundle.js: {:?}", e))?;
            Ok(())
        })?;

        Ok(Self { runtime, context })
    }

    /// 创建本地房间并初始化
    pub fn init_room(&self, host_user_id: &str, host_name: &str, room_code: &str) -> Result<(), String> {
        self.context.with(|ctx| -> Result<(), String> {
            let global = ctx.globals();
            let engine: Object = global.get("LocalEngine")
                .map_err(|e| format!("LocalEngine global not found: {:?}", e))?;
            let create_room: Function = engine.get("createLocalRoom")
                .map_err(|e| format!("createLocalRoom not found: {:?}", e))?;

            let room = create_room.call::<_, Object>((host_user_id, host_name, room_code))
                .map_err(|e| format!("createLocalRoom call failed: {:?}", e))?;

            // 存储到全局 globalThis.__currentRoom
            global.set("__currentRoom", room)
                .map_err(|e| format!("Failed to store __currentRoom: {:?}", e))?;
            Ok(())
        })
    }

    /// 向房间添加/注册玩家 (支持加入房间)
    pub fn add_player(&self, user_id: &str, name: &str) -> Result<(), String> {
        self.context.with(|ctx| -> Result<(), String> {
            let global = ctx.globals();
            let room: Object = global.get("__currentRoom")
                .map_err(|e| format!("__currentRoom not found: {:?}", e))?;
            let players: rquickjs::Array = room.get("players")
                .map_err(|e| format!("players not found: {:?}", e))?;

            let len = players.len();
            for i in 0..len {
                if let Ok(p) = players.get::<Object>(i) {
                    if let Ok(uid) = p.get::<_, String>("userId") {
                        if uid == user_id {
                            let _ = p.set("online", true);
                            return Ok(());
                        }
                    }
                }
            }

            let new_player = Object::new(ctx.clone())
                .map_err(|e| format!("Failed to create player: {:?}", e))?;
            new_player.set("id", format!("ble_{}", user_id))
                .map_err(|e| format!("Failed to set id: {:?}", e))?;
            new_player.set("userId", user_id)
                .map_err(|e| format!("Failed to set userId: {:?}", e))?;
            new_player.set("name", name)
                .map_err(|e| format!("Failed to set name: {:?}", e))?;
            new_player.set("avatar", "🎱")
                .map_err(|e| format!("Failed to set avatar: {:?}", e))?;
            new_player.set("isHost", false)
                .map_err(|e| format!("Failed to set isHost: {:?}", e))?;
            new_player.set("online", true)
                .map_err(|e| format!("Failed to set online: {:?}", e))?;
            new_player.set("cardCount", 0)
                .map_err(|e| format!("Failed to set cardCount: {:?}", e))?;

            let empty_cards = rquickjs::Array::new(ctx.clone())
                .map_err(|e| format!("Failed to create empty cards: {:?}", e))?;
            let empty_pocketed = rquickjs::Array::new(ctx.clone())
                .map_err(|e| format!("Failed to create empty pocketed: {:?}", e))?;
            new_player.set("cards", empty_cards)
                .map_err(|e| format!("Failed to set cards: {:?}", e))?;
            new_player.set("pocketedCards", empty_pocketed)
                .map_err(|e| format!("Failed to set pocketedCards: {:?}", e))?;
            new_player.set("wins", 0)
                .map_err(|e| format!("Failed to set wins: {:?}", e))?;
            new_player.set("isWinner", false)
                .map_err(|e| format!("Failed to set isWinner: {:?}", e))?;
            new_player.set("totalScore", 0)
                .map_err(|e| format!("Failed to set totalScore: {:?}", e))?;

            players.set(len, new_player)
                .map_err(|e| format!("Failed to push player: {:?}", e))?;
            Ok(())
        })
    }

    /// 应用操作指令 (如 start_game, pocket_ball 等)
    pub fn handle_command(&self, command_json: &str) -> Result<bool, String> {
        self.context.with(|ctx| -> Result<bool, String> {
            let global = ctx.globals();
            let engine: Object = global.get("LocalEngine")
                .map_err(|e| format!("LocalEngine global not found: {:?}", e))?;
            let handle_cmd: Function = engine.get("handleLocalCommand")
                .map_err(|e| format!("handleLocalCommand not found: {:?}", e))?;

            let parse_fn: Function = ctx.eval("JSON.parse")
                .map_err(|e| format!("JSON.parse not found: {:?}", e))?;
            let cmd_obj: Object = parse_fn.call((command_json,))
                .map_err(|e| format!("Failed to parse command_json: {:?}", e))?;

            let current_room: Object = global.get("__currentRoom")
                .map_err(|e| format!("__currentRoom not found: {:?}", e))?;

            let res: Object = handle_cmd.call((current_room, cmd_obj))
                .map_err(|e| format!("handleLocalCommand failed: {:?}", e))?;

            let changed: bool = res.get("changed").unwrap_or(false);
            Ok(changed)
        })
    }

    /// 针对指定玩家生成脱敏的 BLE 紧凑二进制包 (Vec<u8>)
    pub fn get_ble_binary_state(&self, target_user_id: &str) -> Result<Vec<u8>, String> {
        self.context.with(|ctx| -> Result<Vec<u8>, String> {
            let global = ctx.globals();
            let engine: Object = global.get("LocalEngine")
                .map_err(|e| format!("LocalEngine global not found: {:?}", e))?;
            let get_state: Function = engine.get("getLocalBleState")
                .map_err(|e| format!("getLocalBleState not found: {:?}", e))?;
            let encode_state: Function = engine.get("encodeBleRoomState")
                .map_err(|e| format!("encodeBleRoomState not found: {:?}", e))?;

            let current_room: Object = global.get("__currentRoom")
                .map_err(|e| format!("__currentRoom not found: {:?}", e))?;

            let ble_state_obj: Object = get_state.call((current_room, target_user_id))
                .map_err(|e| format!("getLocalBleState failed: {:?}", e))?;

            let uint8_array: Object = encode_state.call((ble_state_obj,))
                .map_err(|e| format!("encodeBleRoomState failed: {:?}", e))?;

            // 从 JS Uint8Array 提取二进制字节
            let length: usize = uint8_array.get("length").unwrap_or(0);
            let mut bytes = Vec::with_capacity(length);
            for i in 0..length {
                let byte: u8 = uint8_array.get(i as u32).unwrap_or(0);
                bytes.push(byte);
            }

            Ok(bytes)
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_local_engine_quickjs_lifecycle() {
        let engine = LocalGameEngine::new().expect("Failed to create LocalGameEngine");
        engine.init_room("host_123", "老球霸", "9999").expect("Failed to init room");

        // 初始状态二进制导出
        let initial_bytes = engine.get_ble_binary_state("host_123").expect("Failed to get initial state");
        assert!(!initial_bytes.is_empty());
        assert_eq!(initial_bytes[0], 0x01); // 协议版本号

        // 加入第二位玩家
        engine.add_player("guest_456", "挑战者").expect("Failed to add player");

        // 开局指令
        let start_cmd = r#"{"type":"start_game","actorUserId":"host_123"}"#;
        let changed = engine.handle_command(start_cmd).expect("Failed to handle start_game");
        assert!(changed);

        // 开局后 Host 视角二进制包
        let playing_bytes = engine.get_ble_binary_state("host_123").expect("Failed to get playing state");
        assert!(playing_bytes.len() > 10);
        assert_eq!(playing_bytes[0], 0x01);

        // 罚牌指令生成 UTF-8 lastActionText (带中文字符和 Emoji)
        let penalty_cmd = r#"{"type":"draw_penalty","actorUserId":"host_123"}"#;
        let penalty_changed = engine.handle_command(penalty_cmd).expect("Failed to handle draw_penalty");
        assert!(penalty_changed);

        // 验证带有 UTF-8 lastActionText 的二进制导出成功 (杜绝 TextEncoder 异常)
        let after_penalty_bytes = engine.get_ble_binary_state("host_123").expect("Failed to get state with UTF-8 action text");
        assert!(after_penalty_bytes.len() > playing_bytes.len());

        // 验证未知用户查询不会泄露房主手牌 (防信息泄露)
        let unknown_user_bytes = engine.get_ble_binary_state("unknown_spy_999").expect("Failed to get unknown user state");
        assert_eq!(unknown_user_bytes[9], 0xff); // selfSeatIndex 必须为 0xff (未定位)
        assert_eq!(unknown_user_bytes[11], 0);   // selfHandCards 长度必须为 0，严禁泄露房主手牌
    }

    #[test]
    fn test_crypto_get_random_values_unbiased_32bit() {
        let engine = LocalGameEngine::new().expect("Failed to create engine");
        engine.context.with(|ctx| {
            // 在 QuickJS 运行时中测试 crypto.getRandomValues 对 Uint32Array 的完整 32 位填充
            let result: bool = ctx.eval(r#"
                var u32 = new Uint32Array(50);
                crypto.getRandomValues(u32);
                var hasLargeValue = false;
                for (var i = 0; i < u32.length; i++) {
                    if (u32[i] > 255) {
                        hasLargeValue = true;
                        break;
                    }
                }
                hasLargeValue;
            "#).expect("Failed to eval crypto test");
            // 50 个 32 位均匀安全随机数中，出现大于 255 的概率为 1 - (256/2^32)^50 ≈ 1.0 (绝对为 true)
            assert!(result, "getRandomValues must fill full 32-bit values without 8-bit truncation!");
        });
    }
}


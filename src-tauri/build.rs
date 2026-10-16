use std::path::Path;
use std::process::Command;

fn main() {
    let bundle_path = Path::new("engine.bundle.js");
    if !bundle_path.exists() {
        println!("cargo:warning=engine.bundle.js not found, attempting to build from ../shared/engine/isomorphicEngine.ts...");
        let status = Command::new("pnpm")
            .arg("run")
            .arg("build:engine")
            .current_dir("..")
            .status();

        if status.is_err() || !bundle_path.exists() {
            panic!(
                "\n\n=================================================================\n\
                [ERROR] 找不到真实的游戏引擎产物 `src-tauri/engine.bundle.js`！\n\
                请先在项目根目录下执行 `pnpm run build:engine` 生成真实状态机 Bundle，\n\
                严禁使用假桩文件编译导致应用无法开局。\n\
                =================================================================\n\n"
            );
        }
    }

    println!("cargo:rerun-if-changed=engine.bundle.js");
    println!("cargo:rerun-if-changed=../shared/engine/isomorphicEngine.ts");
    tauri_build::build();
}

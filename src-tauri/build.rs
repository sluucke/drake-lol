fn main() {
    println!("cargo:rerun-if-changed=../plugin/.build-id");
    println!("cargo:rerun-if-changed=../plugin/dist/index.js");
    tauri_build::build()
}

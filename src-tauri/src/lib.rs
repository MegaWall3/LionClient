mod commands;
mod types;

use commands::{
    call_llm_stream,
    list_files,
    read_file,
    search_in_files,
    delete_file,
    rename_file,
    copy_file,
    write_file,
    append_to_file,
    replace_in_file,
    download_file,
    fetch_webpage,
    run_command,
};

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            call_llm_stream,
            list_files,
            read_file,
            search_in_files,
            delete_file,
            rename_file,
            copy_file,
            write_file,
            append_to_file,
            replace_in_file,
            download_file,
            fetch_webpage,
            run_command,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

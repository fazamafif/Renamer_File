import os
from datetime import datetime

def bulk_rename_files(folder_path, prefix="Dokumen_PKL"):
    if not os.path.exists(folder_path):
        print(f"Error: Folder '{folder_path}' tidak ditemukan.")
        return

    ignored = {os.path.basename(__file__), 'index.html', 'style.css', 'app.js', 'jszip.min.js', 'rename-plan.csv'}
    files = [f for f in os.listdir(folder_path) if os.path.isfile(os.path.join(folder_path, f)) and f not in ignored and not f.startswith('.')]
    
    if not files:
        print("Tidak ada file yang ditemukan di dalam folder tersebut.")
        return

    print(f"Menemukan {len(files)} file. Memulai proses rename...\n")
    success_count = 0
    
    for index, file_name in enumerate(files, start=1):
            
        full_old_path = os.path.join(folder_path, file_name)
        name_without_ext, ext = os.path.splitext(file_name)
        
        timestamp = os.path.getmtime(full_old_path)
        date_str = datetime.fromtimestamp(timestamp).strftime('%Y%m%d')
        
        new_file_name = f"{prefix}_{index:03d}_{date_str}{ext}"
        full_new_path = os.path.join(folder_path, new_file_name)
        
        try:
            os.rename(full_old_path, full_new_path)
            print(f"[SUKSES] {file_name} -> {new_file_name}")
            success_count += 1
        except Exception as e:
            print(f"[GAGAL] Gagal merename {file_name}. Error: {e}")
            
    print(f"\nProses selesai. {success_count} file berhasil di-rename.")

if __name__ == "__main__":
    print("\n=== PROGRAM BULK FILE RENAMER AUTOMATION ===")
    target_folder = input("Masukkan path/jalur folder lokasi file: ").strip()
    file_prefix = input("Masukkan nama awalan/prefix baru: ").strip()
    
    if not file_prefix:
        file_prefix = "Dokumen_Kantor"
        
    bulk_rename_files(target_folder, file_prefix)

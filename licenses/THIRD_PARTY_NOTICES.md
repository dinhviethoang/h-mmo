# Mã nguồn bên thứ ba trong H-MMO

| Thành phần | Nguồn | Giấy phép | Dùng ở |
|---|---|---|---|
| FlowKit — module `editing` (ffmpeg_ops.py, assemble_vertical.py) | github.com/crisng95/flowkit (bản tách `flowkit_core`) | MIT — [LICENSE_FlowKit_MIT.txt](LICENSE_FlowKit_MIT.txt) | `src/main/assembleEngine.ts`, tab **Ghép video** |
| FlowKit — module `review` (contact_sheets.py) | như trên | MIT — [LICENSE_FlowKit_MIT.txt](LICENSE_FlowKit_MIT.txt) | `src/main/reviewEngine.ts`, tab **Chấm chất lượng** |

Các module trên đã được chuyển thể sang TypeScript cho kiến trúc Electron của H-MMO (xem chú thích đầu mỗi file).
Khi phân phối lại H-MMO, giữ nguyên thư mục `licenses/` (bản cài đặt tự chép vào `resources/licenses`).

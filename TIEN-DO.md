# H-MMO — Tiến độ

## Đã xong
- Chế độ Gối Sách (nhánh `goi-sach-mode`, đã đẩy lên github.com/dinhviethoang/h-mmo — repo CÔNG KHAI, không đẩy nhánh `backup-truoc-xoa-key`).
- 16/10: sửa shortcut `H-MMO.lnk` ngoài Desktop (icon trỏ về `build/hmmo-gear.ico` thư mục mới).
- 16/10: chép hình Muse v01/v06 vào `Videos\H-MMO\GoiSach\hinh` (thư mục ảnh dùng chung), chép storyboard v01/v06 vào `Videos\H-MMO\GoiSach\<tên-kịch-bản>\storyboard\`.

- 16/10: trang "Video vẽ tay" (dây chuyền wb-explainer trong app) — typecheck + build OK, đã commit ffaae33 (chưa push), CHƯA chạy thử trong GUI:
  - Python: `engines/wb-explainer/` (đường dẫn qua biến môi trường WB_IMAGE_DIR, WB_SRT_PY, WB_SRT_SCRIPTS, WB_HAND, WB_AVATAR...).
  - Electron: `src/main/explainerEngine.ts`, `src/renderer/src/pages/ExplainerPage.tsx`, chế độ `only:'audio'` trong goiSachEngine.
  - `tools\wb-explainer` gốc giữ nguyên, chưa xoá. Cài đặt trang lưu ở userData/explainer-settings.json.
  - Kiểm tra: check_images v06 = 63/63; layout.py bản mới ra y hệt v06-layout.json cũ.
- 16/10: tự viết phân cảnh Short `engines/wb-explainer/make_short_storyboard.py` (tiêu đề = "Chữ to" trong kịch bản; Antigravity Flash chọn hình có sẵn của bản dài + 2 dòng chữ; dự phòng chọn theo từ khoá). Bước 5 tự gọi nếu chưa có vNN-short.json; nút "Viết lại phân cảnh Short" cất thư mục short-vNN cũ thành short-vNN-cu-<giờ>. Thử v06: gần giống bản viết tay.

## Đang dở
- Người dùng mở app thử trang "Video vẽ tay" (chọn video-06 → các bước 1-5 phải hiện đã xong); ổn thì push nhánh goi-sach-mode.

## Việc tiếp theo
- Kiểm tra trang "Video vẽ tay" chạy thật với v06 (bước đã xong phải hiện đủ trạng thái).
- Chuyển venv `tools\srt-whiteboard-animation` vào dự án; dọn các file test/fix_* ở thư mục gốc.

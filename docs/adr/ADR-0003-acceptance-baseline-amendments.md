# ADR-0003: Điều chỉnh căn cứ nghiệm thu sitemap, Domain và cookie

- Trạng thái: Chấp nhận theo quyền điều chỉnh đặc tả người dùng xác nhận ngày 16/11/2026.
- Căn cứ: người dùng cho phép điều chỉnh đặc tả sau đề xuất chốt ba phương án giữ thiết kế hiện tại.
- Áp dụng: Culinary_Blog_Spec.md phiên bản 1.4.0 và bảng truy vết. Không sửa PDF SRS gốc.

## Hiệu lực

Các tiêu chí dưới đây thay thế đúng các điều khoản được nêu của SRS gốc cho lần nghiệm thu hiện hành. Các mã yêu cầu được giữ để truy vết nguồn; không đánh đồng đáp ứng tiêu chí điều chỉnh với tuân thủ nguyên văn PDF. Các yêu cầu còn lại không đổi. Các ghi chú lịch sử coi khác biệt này là blocker thiết kế được thay thế bởi quyết định này; bằng chứng kiểm chứng vẫn cần bổ sung.

| Yêu cầu | Điều khoản được thay thế | Tiêu chí hiện hành |
|---|---|---|
| FR-JOB-003, NFR-SEO-003 | Hangfire sinh và lưu sitemap.xml lúc 02:00 UTC | Next.js cung cấp sitemap XML động tại /sitemap.xml và robots.txt trỏ đúng origin public. Không cần job/file sitemap riêng. |
| NFR-MAINT-004 | Domain chỉ dùng BCL tuyệt đối | Giữ hướng phụ thuộc phân tầng; chỉ cho phép Identity tại ApplicationUser.cs và Npgsql/SearchVector tại Recipe.cs theo ADR-0001; khóa package và vị trí dùng bằng architecture tests. |
| NFR-SEC-005 (phần refresh cookie) | SameSite=Strict bắt buộc | HttpOnly, Secure, SameSite=Lax; production HTTPS; kiểm tra origin/cross-site cho cookie mutations và CORS allowlist. Không nới lỏng các điều khoản TLS/HSTS/CORS còn lại. |

## Kiểm chứng cần có trước Verified

- Sitemap: kiểm tra XML và Content-Type thực tế, public origin/canonical URLs, pagination, chỉ Published và không có nội dung private/đã xóa; kiểm tra sau publish/unpublish/delete, cache/revalidation và upstream outage. Fallback tĩnh khi lỗi phải an toàn, không được dùng làm bằng chứng đã liệt kê đầy đủ nội dung. Kiểm tra giới hạn sitemap trên dataset nghiệm thu; nếu vượt giới hạn hiện hữu phải phân mảnh sitemap hoặc xử lý trước nghiệm thu.
- Domain: kiểm tra hướng project/assembly references, đúng hai package và vị trí ngoại lệ; không cho namespace/provider lan sang file khác. Chạy các suite kiến trúc và hồi quy auth/search liên quan khi thay đổi model.
- Cookie: kiểm tra cờ Set-Cookie và xóa cookie, origin/cross-site rejection, refresh/logout và Google login trên topology HTTPS thực tế. Kiểm tra TLS/HSTS/CORS còn lại của NFR-SEC-005. Nếu frontend/API nằm ở các site khác nhau làm Lax không hoạt động, điều chỉnh topology hoặc mở quyết định thiết kế mới; không tự đổi SameSite=None.
- Mỗi kết quả ghi commit/working-tree identity, môi trường, lệnh và bằng chứng. Phê duyệt thiết kế không phải kết quả test; giữ MissingEvidence đến khi đủ phạm vi.

## Hệ quả

Không cần refactor model persistence hay bổ sung Hangfire sitemap job để khớp các điều khoản cũ. Tập trung kiểm chứng hành vi, tính an toàn và vận hành của thiết kế hiện tại. Không thay đổi schema/database hay code runtime trong lần cập nhật đặc tả này.

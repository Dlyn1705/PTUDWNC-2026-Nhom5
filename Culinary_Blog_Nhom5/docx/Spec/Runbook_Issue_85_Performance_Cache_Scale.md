# Runbook Issue #85

Ngày: 05/11/2026.

Hướng dẫn chạy, biến môi trường, dataset, topology, threshold và giới hạn phép đo được duy trì cùng script tại [tests/performance/README.md](../../tests/performance/README.md).

1. Đọc [ADR TTL/profile](./ADR_Issue_85_Cache_TTL_And_Performance_Profile.md), kiểm tra host đủ tài nguyên, không dùng dữ liệu thật.
2. Chạy `run.ps1 -Mode prepare`, kiểm tra seed/plan/health hai API.
3. Chạy `scale.mjs`, k6 smoke, rồi warm ba lượt trên host chuẩn. Chạy mixed/cold/stress/soak riêng, lưu time series và điểm gãy.
4. Chạy browser/Lighthouse trên production build, giữ mọi lượt thất bại cùng kết quả median.
5. Đối chiếu kết quả với từng tiêu chí nghiệm thu của Issue #85 và [Spec](./Culinary_Blog_Spec.md). Kết quả thiếu mẫu, counter reset, rate limit hay host tranh chấp không được ghi đạt.
6. Upload artifact đã loại secret, ghi SHA/diff chính xác và dừng stack Issue #85. Chưa đóng issue khi còn thiếu bằng chứng tải chuẩn, SQL dưới tải hoặc job/failover.

Nếu API không lên: kiểm tra log riêng service và health; không đổi quota/secret production để sửa stack test. Nếu p95/p99 fail: kiểm tra CPU throttling/pool/DB/epoch trước; giữ baseline và chỉ tối ưu sau khi xác định bottleneck. Nếu hit rate fail: kiểm tra cửa sổ đo, key distribution, mutation invalidation và metric outcome, không cộng khóa version vào hits.

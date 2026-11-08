import { ApiProblemError, toApiProblemError } from "./problemDetails";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const types = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
export function validateImageFile(file: Pick<File, "size" | "type">): void {
  const message = !types.has(file.type) ? "Chỉ chấp nhận ảnh JPEG, PNG, WebP hoặc AVIF."
    : file.size <= 0 || file.size > MAX_IMAGE_BYTES ? "Ảnh phải có dung lượng từ 1 byte đến 5 MiB." : undefined;
  if (message) throw new ApiProblemError({ errors: { file: [message] } }, undefined, {
    kind: "file_validation", clientCode: "INVALID_IMAGE_FILE", operation: "upload",
  });
}

/** Only trusted field-validation text is displayed; raw transport/proxy/5xx messages stay out of the UI. */
export function imageErrorMessage(cause: unknown): string {
  const error = toApiProblemError(cause);
  let message: string;
  switch (error.kind) {
    case "cancelled": message = "Đã dừng thao tác. Nếu máy chủ đã nhận file, ảnh vẫn có thể được lưu."; break;
    case "request_timeout": message = "Máy chủ chưa phản hồi kịp. Hãy kiểm tra lại trạng thái trước khi thử lại."; break;
    case "processing_timeout": message = "Ảnh gốc đã được lưu nhưng chưa xử lý xong. Kiểm tra lại trạng thái."; break;
    case "image_processing": message = "Ảnh đã tải lên nhưng chưa tạo được ảnh xem trước. Ảnh gốc vẫn được lưu."; break;
    case "network": message = "Không thể kết nối máy chủ. Kiểm tra kết nối và thử tải lại."; break;
    case "file_validation":
    case "validation": {
      const fields = Object.entries(error.errors).flatMap(([field, values]) => values
        .filter(value => value.length <= 500 && !/[<>]|\bat\s+\S+\s*\(/.test(value))
        .map(value => `${/^alttext$/i.test(field) ? "Văn bản thay thế" : "Dữ liệu ảnh"}: ${value}`));
      message = fields.join(" ") || (error.status === 413 ? "Ảnh vượt quá dung lượng cho phép (tối đa 5 MiB)."
        : error.status === 415 ? "Định dạng ảnh không được hỗ trợ." : "Dữ liệu ảnh không hợp lệ. Hãy kiểm tra lại file và văn bản thay thế.");
      break;
    }
    case "invalid_response": message = "Không nhận được dữ liệu ảnh hợp lệ. Hãy tải lại để kiểm tra trạng thái."; break;
    default:
      message = error.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : error.status === 403 ? "Bạn không có quyền thực hiện thao tác với ảnh này."
        : error.status === 404 ? "Ảnh hoặc công thức không còn tồn tại. Hãy tải lại danh sách."
        : error.code === "RECIPE_ARCHIVED" ? "Khôi phục công thức từ lưu trữ trước khi tải ảnh."
        : error.status === 409 ? "Dữ liệu ảnh vừa thay đổi. Hãy tải lại danh sách trước khi thử lại."
        : error.status === 429 ? `Thao tác quá nhanh. ${error.retryAfterMs ? `Vui lòng chờ ít nhất ${Math.ceil(error.retryAfterMs / 1000)} giây.` : "Vui lòng chờ rồi thử lại."}`
        : error.status && error.status >= 500 ? "Máy chủ gặp lỗi. Hãy kiểm tra lại trạng thái sau."
        : "Không thể hoàn tất thao tác ảnh. Hãy tải lại để kiểm tra.";
  }
  const id = error.correlationId ?? error.lastResponse?.correlationId;
  return id ? `${message} Mã tham chiếu: ${id}.` : message;
}

export function needsImageReconciliation(error: ApiProblemError): boolean {
  return ["cancelled", "request_timeout", "network", "invalid_response", "unknown"].includes(error.kind)
    || (error.status !== undefined && error.status >= 500);
}

import { errorCorrelationId, validCorrelationId } from "./logger";

/** Only safe metadata crosses into UI; never render raw exception/body text. */
export function errorPresentation(error: unknown) {
  const value = error && typeof error === "object" ? error as {
    status?: number; correlationId?: string;
    response?: { status?: number; data?: { correlationId?: string } };
  } : undefined;
  const status = value?.response?.status ?? value?.status;
  const correlationId = validCorrelationId(value?.correlationId)
    ?? (value ? errorCorrelationId(value) : undefined)
    ?? validCorrelationId(value?.response?.data?.correlationId);
  const description = status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
    : status === 403 ? "Bạn không có quyền truy cập nội dung này."
    : status === 404 ? "Nội dung không còn tồn tại hoặc đã được di chuyển."
    : status === 400 || status === 422 ? "Dữ liệu chưa hợp lệ. Vui lòng kiểm tra các trường và bộ lọc."
    : status === 429 ? "Có quá nhiều yêu cầu. Vui lòng đợi một lát rồi thử lại."
    : "Không thể tải dữ liệu lúc này. Vui lòng thử lại sau ít phút.";
  return { status, correlationId, description, canRetry: ![400, 401, 403, 404, 422].includes(status ?? 0) };
}

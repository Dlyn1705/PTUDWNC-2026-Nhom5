import { z } from "zod";

export const emptyStep = () => ({ title: "", description: "", timerMinutes: "", imageUrl: "" });
export const stepDraftSchema = z.object({
  stepId: z.string().uuid().optional(),
  title: z.string().trim().max(200, "Tiêu đề tối đa 200 ký tự."),
  description: z.string().trim().min(1, "Vui lòng nhập mô tả bước.").max(2000, "Mô tả tối đa 2.000 ký tự."),
  timerMinutes: z.string().trim().refine(value => value === "" || (/^\d+$/.test(value) && Number(value) <= 2147483647), "Hẹn giờ phải là số nguyên không âm hợp lệ."),
  imageUrl: z.string().trim().max(500, "URL ảnh tối đa 500 ký tự.").refine(value => {
    if (!value) return true;
    try { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
  }, "Vui lòng dùng URL ảnh HTTP/HTTPS hợp lệ."),
});
export const stepFormSchema = z.object({ items: z.array(stepDraftSchema).max(100, "Mỗi công thức tối đa 100 bước.") });
export type StepDraft = z.infer<typeof stepDraftSchema>;
export const stepPayload = (draft: StepDraft) => ({ title: draft.title.trim() || null, description: draft.description.trim(),
  timerMinutes: draft.timerMinutes.trim() === "" ? null : Number(draft.timerMinutes), imageUrl: draft.imageUrl.trim() || null });

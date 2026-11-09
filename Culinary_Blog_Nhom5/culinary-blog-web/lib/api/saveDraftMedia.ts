import { uploadRecipeImage } from "./fileApi";
import { imageErrorMessage, needsImageReconciliation } from "./imageErrors";
import { toApiProblemError } from "./problemDetails";
import { stepApi } from "./stepApi";

export async function saveDraftMedia(
  recipeId: string,
  cover: File | null,
  stepFiles: (File | undefined)[],
) {
  const warnings: string[] = [];
  const retryFiles: (File | undefined)[] = [];
  let throttled = false;
  let coverFailed = false;
  if (cover) {
    try {
      await uploadRecipeImage(
        recipeId,
        cover,
        undefined,
        undefined,
        "Ảnh bìa công thức",
      );
    } catch (error) {
      coverFailed = true;
      throttled = toApiProblemError(error).status === 429;
      warnings.push(
        `Ảnh bìa: ${imageErrorMessage(error)} Kiểm tra thư viện ảnh trước khi tải lại.`,
      );
    }
  }
  for (const [index, file] of stepFiles.entries()) {
    if (!file) continue;
    if (coverFailed || throttled) {
      retryFiles[index] = file;
      continue;
    }
    let accepted = false;
    try {
      const before = await stepApi.list(recipeId);
      const step = before.items.find((item) => item.stepNumber === index + 1);
      if (!step) {
        warnings.push(
          `Không tìm thấy bước ${index + 1} để gắn ảnh. Kiểm tra lại danh sách bước.`,
        );
        continue;
      }
      const image = await uploadRecipeImage(
        recipeId,
        file,
        undefined,
        undefined,
        `Ảnh bước ${index + 1}`,
        {
          onImage: () => {
            accepted = true;
          },
        },
      );
      accepted = true;
      const after = await stepApi.list(recipeId);
      const current = after.items.find((item) => item.id === step.id);
      if (!current || JSON.stringify(current) !== JSON.stringify(step)) {
        warnings.push(
          `Bước ${index + 1} đã thay đổi khi tải ảnh. Chọn lại ảnh trong thư viện để gắn vào bước.`,
        );
        continue;
      }
      await stepApi.save(
        recipeId,
        step.id,
        {
          title: step.title,
          description: step.description,
          timerMinutes: step.timerMinutes,
          imageUrl: image.originalUrl,
        },
        after.etag,
      );
    } catch (cause) {
      const error = toApiProblemError(cause);
      throttled = error.status === 429;
      if (!accepted && !error.image && !needsImageReconciliation(error))
        retryFiles[index] = file;
      warnings.push(
        accepted
          ? `Ảnh bước ${index + 1} có trong thư viện. Hãy kiểm tra liên kết trước khi thử lại.`
          : `Ảnh bước ${index + 1}: ${imageErrorMessage(error)}`,
      );
    }
  }
  return { warnings, retryFiles };
}

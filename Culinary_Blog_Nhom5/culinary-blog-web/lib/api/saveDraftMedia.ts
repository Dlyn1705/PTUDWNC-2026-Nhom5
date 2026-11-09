import { uploadRecipeImage } from "./fileApi";
import { imageErrorMessage, needsImageReconciliation } from "./imageErrors";
import { toApiProblemError } from "./problemDetails";
import { stepApi } from "./stepApi";

export async function saveDraftMedia(
  recipeId: string,
  cover: File | null,
  stepFiles: (File | undefined)[],
  onProgress: (current: number, total: number) => void,
  stepIds: (string | undefined)[],
) {
  const warnings: string[] = [];
  const retryFiles: (File | undefined)[] = [];
  let retryCover: File | null = null;
  let paused = false;
  let current = 0;
  const total = Number(Boolean(cover)) + stepFiles.filter(Boolean).length;

  if (cover) {
    onProgress(++current, total);
    let accepted = false;
    try {
      await uploadRecipeImage(
        recipeId,
        cover,
        undefined,
        undefined,
        "Ảnh bìa công thức",
        {
          onImage: () => {
            accepted = true;
          },
        },
      );
    } catch (cause) {
      const error = toApiProblemError(cause);
      // Do not let a step image become the recipe primary when the cover
      // upload failed or has an ambiguous outcome. Keep all remaining files
      // queued until the user can retry the cover upload.
      paused = true;
      if (!accepted && !error.image && !needsImageReconciliation(error))
        retryCover = cover;
      warnings.push(`Ảnh bìa: ${imageErrorMessage(error)}`);
    }
  }

  // Uploads rotate the recipe version. Read the step ETag after all uploads.
  const uploaded: { index: number; url: string }[] = [];
  for (const [index, file] of stepFiles.entries()) {
    if (!file) continue;
    if (paused) {
      retryFiles[index] = file;
      continue;
    }
    onProgress(++current, total);
    let accepted = false;
    try {
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
      uploaded.push({ index, url: image.originalUrl });
    } catch (cause) {
      const error = toApiProblemError(cause);
      paused = error.status === 429;
      if (!accepted && !error.image && !needsImageReconciliation(error))
        retryFiles[index] = file;
      warnings.push(`Ảnh bước ${index + 1}: ${imageErrorMessage(error)}`);
    }
  }

  if (uploaded.length) {
    try {
      const snapshot = await stepApi.list(recipeId);
      for (const step of snapshot.items) {
        stepIds[step.stepNumber - 1] ??= step.id;
      }
      for (const { index, url } of uploaded) {
        const step = snapshot.items.find((item) => item.id === stepIds[index]);
        if (!step) {
          warnings.push(
            `Không tìm thấy bước ${index + 1}. Ảnh vẫn có trong thư viện.`,
          );
          continue;
        }
        const result = await stepApi.save(
          recipeId,
          step.id,
          {
            title: step.title,
            description: step.description,
            timerMinutes: step.timerMinutes,
            imageUrl: url,
          },
          snapshot.etag,
        );
        snapshot.etag = result.etag;
      }
    } catch (error) {
      warnings.push(
        `Ảnh đã có trong thư viện. Kiểm tra và gắn các ảnh còn thiếu vào bước. ${imageErrorMessage(error)}`,
      );
    }
  }
  return { warnings, retryFiles, retryCover };
}

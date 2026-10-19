"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import FileUploadDropzone from "@/components/common/FileUploadDropzone";
import { deleteRecipeImage, getRecipeImages, setRecipeImagePrimary, type RecipeImageDto } from "@/lib/api/fileApi";
import { imageErrorMessage, needsImageReconciliation } from "@/lib/api/imageErrors";
import { toApiProblemError } from "@/lib/api/problemDetails";

type Props = { recipeId: string; archived?: boolean; onMutation?: () => void };
const statusText = {
  Pending: "Đang chờ tạo thumbnail…", Processing: "Đang tạo thumbnail…",
  Completed: "Đã xử lý", Failed: "Chưa tạo được ảnh xem trước; ảnh gốc vẫn được lưu.",
};

export default function ImageGalleryManager({ recipeId, archived = false, onMutation }: Props) {
  const [images, setImages] = useState<RecipeImageDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [mustReload, setMustReload] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const listController = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false);
  const uploading = useRef(false);
  const requestId = useRef(0);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    listController.current?.abort();
    const request = new AbortController();
    listController.current = request;
    const abort = () => request.abort();
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    try {
      const result = await getRecipeImages(recipeId, request.signal);
      if (!request.signal.aborted && id === requestId.current) {
        setImages(result);
        setLoading(false);
        setMustReload(false);
      }
    } catch (cause) {
      if (!request.signal.aborted && id === requestId.current) throw cause;
    } finally {
      signal?.removeEventListener("abort", abort);
      if (listController.current === request) listController.current = null;
    }
  }, [recipeId]);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    void Promise.resolve().then(() => {
      if (!abort.signal.aborted) return reload(abort.signal);
    }).catch(cause => {
      if (!abort.signal.aborted && !uploading.current) { setError(imageErrorMessage(cause)); setLoading(false); }
    });
    return () => { abort.abort(); };
  }, [reload]);
  useEffect(() => {
    if (!retryAfterMs) return;
    const timer = setTimeout(() => setRetryAfterMs(0), Math.min(retryAfterMs, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [retryAfterMs]);

  const uploadBusyChanged = useCallback((value: boolean) => {
    uploading.current = value;
    if (value) { ++requestId.current; listController.current?.abort(); }
    else setLoading(false);
    setUploadBusy(value);
  }, []);

  const refresh = async () => {
    if (mutationBusy.current || uploading.current || retryAfterMs) return;
    const signal = controller.current?.signal;
    mutationBusy.current = true;
    setBusy(true);
    try { await reload(signal); if (!signal?.aborted) setError(""); }
    catch (cause) {
      if (!signal?.aborted) {
        const problem = toApiProblemError(cause);
        setError(imageErrorMessage(problem));
        setRetryAfterMs(problem.retryAfterMs ?? 0);
        setLoading(false);
      }
    } finally { mutationBusy.current = false; if (!signal?.aborted) setBusy(false); }
  };

  const mutate = async (image: RecipeImageDto, action: "primary" | "delete") => {
    if (mutationBusy.current || uploading.current || mustReload || retryAfterMs) return;
    if (action === "delete" && !window.confirm("Xóa ảnh này khỏi công thức?")) return;
    mutationBusy.current = true;
    ++requestId.current;
    const signal = controller.current?.signal;
    setBusy(true);
    setError("");
    let committed = false;
    try {
      if (action === "delete") await deleteRecipeImage(recipeId, image.id, signal);
      else await setRecipeImagePrimary(recipeId, image.id, signal);
      committed = true;
      if (signal?.aborted) return;
      onMutation?.();
      await reload(signal);
    } catch (cause) {
      if (!signal?.aborted) {
        const problem = toApiProblemError(cause);
        setRetryAfterMs(problem.retryAfterMs ?? 0);
        setMustReload(committed || needsImageReconciliation(problem) || problem.status === 409 || problem.status === 404);
        setError(`${committed ? "Thao tác đã hoàn tất nhưng chưa tải lại được danh sách. " : ""}${imageErrorMessage(problem)}`);
      }
    } finally {
      mutationBusy.current = false;
      if (!signal?.aborted) setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-6" aria-label="Bộ sưu tập ảnh công thức">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Ảnh công thức</h2>
        <button type="button" disabled={busy || uploadBusy || retryAfterMs > 0} onClick={() => void refresh()} className="rounded-lg border px-3 py-2 disabled:opacity-50">Tải lại ảnh</button>
      </div>
      {archived ? <p>Khôi phục công thức từ lưu trữ trước khi tải thêm ảnh.</p> : (
        <FileUploadDropzone key={recipeId} recipeId={recipeId} disabled={busy || mustReload || retryAfterMs > 0}
          onBusyChange={uploadBusyChanged}
          onImagesChange={items => { ++requestId.current; setImages(items); setLoading(false); setError(""); }}
          onImageChange={image => {
            ++requestId.current;
            setImages(current => [...current.filter(x => x.id !== image.id), image]);
            setLoading(false);
          }}
          onUploadSuccess={() => {
            onMutation?.();
            const signal = controller.current?.signal;
            void reload(signal).catch(cause => {
              if (!signal?.aborted) {
                setMustReload(true);
                setError(`Ảnh đã xử lý hoàn tất nhưng chưa tải lại được danh sách. ${imageErrorMessage(cause)}`);
              }
            });
          }} />
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {mustReload && <p role="status">Tải lại ảnh để xác nhận trạng thái trước khi thực hiện thao tác tiếp theo.</p>}
      {loading ? <p role="status">Đang tải ảnh…</p> : images.length === 0 ? <p>Chưa có ảnh cho công thức này.</p> : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {images.map(image => (
            <li key={image.id} className="space-y-2 rounded-xl border p-3">
              <Image src={image.thumbnailUrl ?? image.mediumUrl ?? image.originalUrl} alt={image.altText ?? "Ảnh công thức"}
                width={300} height={300} unoptimized className="h-48 w-full rounded-lg object-cover" />
              {image.isPrimary && <p className="font-semibold text-primary">Ảnh chính</p>}
              {image.altText && <p className="break-words text-sm">{image.altText}</p>}
              <p className="text-sm text-gray-600">{statusText[image.processingStatus]}</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || uploadBusy || mustReload || retryAfterMs > 0 || image.isPrimary} onClick={() => void mutate(image, "primary")}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Đặt làm ảnh chính</button>
                <button type="button" disabled={busy || uploadBusy || mustReload || retryAfterMs > 0} onClick={() => void mutate(image, "delete")}
                  aria-label={`Xóa ${image.altText || "ảnh công thức"}`} className="rounded-lg border px-3 py-2 text-sm text-red-600 disabled:opacity-50">Xóa ảnh</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!uploadBusy && images.some(x => ["Pending", "Processing"].includes(x.processingStatus)) &&
        <p role="status">Ảnh vẫn đang được xử lý. Chọn “Tải lại ảnh” để xem trạng thái mới.</p>}
    </section>
  );
}

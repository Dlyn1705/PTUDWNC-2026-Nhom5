"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import FileUploadDropzone from "@/components/common/FileUploadDropzone";
import { deleteRecipeImage, getRecipeImages, setRecipeImagePrimary, type RecipeImageDto } from "@/lib/api/fileApi";

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
  const [polling, setPolling] = useState(true);
  const controller = useRef<AbortController | null>(null);
  const mutationBusy = useRef(false);
  const requestId = useRef(0);

  const reload = useCallback(async (signal?: AbortSignal) => {
    const id = ++requestId.current;
    const result = await getRecipeImages(recipeId, signal);
    if (!signal?.aborted && id === requestId.current) {
      setImages(result);
      setLoading(false);
    }
  }, [recipeId]);

  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      try {
        await reload(abort.signal);
        if (!abort.signal.aborted) setError("");
      } catch {
        if (!abort.signal.aborted) {
          setError("Không thể tải bộ sưu tập ảnh. Hãy thử tải lại.");
          setLoading(false);
        }
      }
      if (!abort.signal.aborted && ++attempts < 60) timer = setTimeout(poll, 3000);
      else if (!abort.signal.aborted) setPolling(false);
    };
    void poll();
    return () => { abort.abort(); clearTimeout(timer); };
  }, [reload]);

  const refresh = async () => {
    const signal = controller.current?.signal;
    try { await reload(signal); if (!signal?.aborted) setError(""); }
    catch { if (!controller.current?.signal.aborted) setError("Không thể tải lại ảnh. Vui lòng thử lại."); }
  };

  const mutate = async (image: RecipeImageDto, action: "primary" | "delete") => {
    if (mutationBusy.current) return;
    if (action === "delete" && !window.confirm("Xóa ảnh này khỏi công thức?")) return;
    mutationBusy.current = true;
    const signal = controller.current?.signal;
    setBusy(true);
    setError("");
    try {
      if (action === "delete") await deleteRecipeImage(recipeId, image.id);
      else await setRecipeImagePrimary(recipeId, image.id);
      if (signal?.aborted) return;
      onMutation?.();
      await reload(signal);
    } catch (cause) {
      if (!controller.current?.signal.aborted) {
        const status = (cause as { response?: { status?: number } }).response?.status;
        setError(status === 409 ? "Ảnh vừa thay đổi. Đã tải lại dữ liệu; hãy thử lại."
          : "Không thể hoàn tất thao tác hoặc tải lại ảnh. Vui lòng kiểm tra và thử lại.");
        try { await reload(controller.current?.signal); } catch { /* Keep the actionable error. */ }
      }
    } finally {
      mutationBusy.current = false;
      if (!controller.current?.signal.aborted) setBusy(false);
    }
  };

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-6" aria-label="Bộ sưu tập ảnh công thức">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Ảnh công thức</h2>
        <button type="button" disabled={busy} onClick={() => void refresh()} className="rounded-lg border px-3 py-2 disabled:opacity-50">Tải lại ảnh</button>
      </div>
      {archived ? <p>Khôi phục công thức từ lưu trữ trước khi tải thêm ảnh.</p> : (
        <FileUploadDropzone recipeId={recipeId} onUploadSuccess={(image) => {
          setImages(current => [...current.filter(x => x.id !== image.id), image]);
          onMutation?.();
          void refresh();
        }} />
      )}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
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
                <button type="button" disabled={busy || image.isPrimary} onClick={() => void mutate(image, "primary")}
                  className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50">Đặt làm ảnh chính</button>
                <button type="button" disabled={busy} onClick={() => void mutate(image, "delete")}
                  aria-label={`Xóa ${image.altText || "ảnh công thức"}`} className="rounded-lg border px-3 py-2 text-sm text-red-600 disabled:opacity-50">Xóa ảnh</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!polling && images.some(x => ["Pending", "Processing"].includes(x.processingStatus)) &&
        <p role="status">Ảnh vẫn đang được xử lý. Chọn “Tải lại ảnh” để xem trạng thái mới.</p>}
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { getRecipeImages, uploadRecipeImage, waitForRecipeImage, type RecipeImageDto } from "@/lib/api/fileApi";
import { imageErrorMessage, needsImageReconciliation, validateImageFile } from "@/lib/api/imageErrors";
import { toApiProblemError } from "@/lib/api/problemDetails";

type Props = {
  recipeId: string;
  disabled?: boolean;
  onUploadSuccess?: (image: RecipeImageDto) => void;
  onImageChange?: (image: RecipeImageDto) => void;
  onImagesChange?: (images: RecipeImageDto[]) => void;
  onBusyChange?: (busy: boolean) => void;
};

export default function FileUploadDropzone({ recipeId, disabled, onUploadSuccess, onImageChange, onImagesChange, onBusyChange }: Props) {
  const [selected, setSelected] = useState<{ file: File; previewUrl: string } | null>(null);
  const [progress, setProgress] = useState(0);
  const [state, setState] = useState<"idle" | "uploading" | "processing" | "checking" | "success" | "error" | "cancelled">("idle");
  const [message, setMessage] = useState("");
  const [altText, setAltText] = useState("");
  const [dragging, setDragging] = useState(false);
  const [savedImage, setSavedImage] = useState<RecipeImageDto | null>(null);
  const [mustReconcile, setMustReconcile] = useState(false);
  const [retryAfterMs, setRetryAfterMs] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);
  const busy = state === "uploading" || state === "processing" || state === "checking";

  useEffect(() => {
    if (!selected) return;
    return () => URL.revokeObjectURL(selected.previewUrl);
  }, [selected]);
  useEffect(() => () => {
    const controller = controllerRef.current;
    controllerRef.current = null;
    controller?.abort();
    onBusyChange?.(false);
  }, [recipeId, onBusyChange]);
  useEffect(() => {
    if (!retryAfterMs) return;
    const timer = setTimeout(() => setRetryAfterMs(0), Math.min(retryAfterMs, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [retryAfterMs]);

  const chooseFile = (candidate?: File) => {
    if (!candidate || controllerRef.current || disabled) return;
    try { validateImageFile(candidate); }
    catch (cause) { setSelected(null); setSavedImage(null); setMessage(imageErrorMessage(cause)); setState("error"); return; }
    setSelected({ file: candidate, previewUrl: URL.createObjectURL(candidate) });
    setSavedImage(null);
    setProgress(0);
    setMessage("");
    setState("idle");
  };

  const upload = async () => {
    if (controllerRef.current || disabled || retryAfterMs || (!selected && !savedImage && !mustReconcile)) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    onBusyChange?.(true);
    const current = () => controllerRef.current === controller;
    setState(mustReconcile ? "checking" : savedImage ? "processing" : "uploading");
    setMessage("");
    const onImage = (image: RecipeImageDto) => {
      if (!current() || controller.signal.aborted) return;
      setSavedImage(image);
      setState("processing");
      onImageChange?.(image);
    };
    try {
      if (mustReconcile) {
        const images = await getRecipeImages(recipeId, controller.signal);
        if (!current() || controller.signal.aborted) return;
        onImagesChange?.(images);
        setMustReconcile(false);
        setState("idle");
        setMessage("Đã tải lại danh sách. Kiểm tra ảnh đã lưu trước khi chọn tải lên lần nữa để tránh tạo ảnh trùng.");
        return;
      }
      const image = savedImage
        ? await waitForRecipeImage(recipeId, savedImage.id, controller.signal, { onImage })
        : await uploadRecipeImage(recipeId, selected!.file, value => { if (current()) setProgress(value); }, controller.signal, altText, { onImage });
      if (!current() || controller.signal.aborted) return;
      setState("success");
      setMessage("Ảnh đã tải lên và xử lý hoàn tất.");
      onUploadSuccess?.(image);
    } catch (cause) {
      if (!current()) return;
      const error = toApiProblemError(cause);
      if (error.image) { setSavedImage(error.image); onImageChange?.(error.image); }
      if (!savedImage && !error.image && needsImageReconciliation(error)) setMustReconcile(true);
      setRetryAfterMs(error.retryAfterMs ?? 0);
      setState(error.kind === "cancelled" ? "cancelled" : "error");
      setMessage(imageErrorMessage(error));
    } finally {
      if (current()) { controllerRef.current = null; onBusyChange?.(false); }
    }
  };

  return (
    <section className="space-y-3" aria-label="Tải ảnh công thức">
      <label
        className={`flex min-h-40 w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-5 text-center transition ${dragging ? "border-primary bg-primary/5" : "border-border bg-muted/40 hover:border-primary"}`}
        aria-describedby="recipe-image-upload-help"
        onDragOver={event => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={event => { event.preventDefault(); setDragging(false); chooseFile(event.dataTransfer.files[0]); }}
      >
        {selected ? <Image src={selected.previewUrl} alt="Xem trước ảnh đã chọn" width={640} height={400} unoptimized className="mb-3 max-h-48 w-auto rounded-lg object-contain" />
          : <span className="mb-2 text-3xl" aria-hidden="true">📷</span>}
        <span className="font-medium">{selected?.file.name ?? "Chọn ảnh hoặc kéo thả vào đây"}</span>
        <span id="recipe-image-upload-help" className="mt-1 text-sm text-muted-foreground">JPEG, PNG, WebP, AVIF · tối đa 5 MiB</span>
        <input className="sr-only" type="file" disabled={busy || disabled} tabIndex={0}
          accept="image/jpeg,image/png,image/webp,image/avif,.jpg,.jpeg,.png,.webp,.avif" aria-label="Chọn ảnh công thức"
          onChange={event => { chooseFile(event.target.files?.[0]); event.currentTarget.value = ""; }} />
      </label>
      {state === "uploading" && <div>
        <progress className="w-full" value={progress} max={100} aria-label={`Đang tải ảnh ${progress}%`} />
        <div className="text-right text-sm text-muted-foreground">{progress}%</div>
        {progress === 100 && <p role="status">Đang chờ máy chủ xác nhận ảnh...</p>}
      </div>}
      {state === "processing" && <p role="status">Ảnh gốc đã được lưu. Đang kiểm tra xử lý ảnh xem trước...</p>}
      {state === "checking" && <p role="status">Đang tải lại danh sách ảnh...</p>}
      {message && <p role={state === "error" ? "alert" : "status"} className={state === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>{message}</p>}
      <div className="flex gap-2">
        {busy ? <button type="button" className="rounded-lg border px-4 py-2" onClick={() => controllerRef.current?.abort()}>Hủy</button>
          : <button type="button" className="rounded-lg bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={disabled || retryAfterMs > 0 || (!selected && !savedImage && !mustReconcile) || state === "success"} onClick={() => void upload()}>
            {mustReconcile ? "Kiểm tra danh sách trước khi thử lại" : savedImage ? "Kiểm tra lại trạng thái" : "Tải ảnh lên"}
          </button>}
        {selected && !busy && <button type="button" disabled={disabled} className="rounded-lg border px-4 py-2"
          onClick={() => { setSelected(null); setSavedImage(null); setProgress(0); setState("idle"); setMessage(""); }}>Chọn ảnh khác</button>}
      </div>
      <label className="block text-sm text-foreground">Văn bản thay thế (không bắt buộc)
        <input value={altText} maxLength={200} disabled={busy || disabled} onChange={event => setAltText(event.target.value)}
          className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2" placeholder="Mô tả ngắn về món ăn trong ảnh" />
      </label>
    </section>
  );
}

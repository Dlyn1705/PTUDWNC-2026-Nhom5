"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import FileUploadDropzone from "@/components/common/FileUploadDropzone";
import { getRecipeImages, type RecipeImageDto } from "@/lib/api/fileApi";
import Image from "next/image";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { stepApi, type StepDto } from "@/lib/api/stepApi";
import { ApiProblemError, toApiProblemError } from "@/lib/api/problemDetails";
import { emptyStep, stepFormSchema, stepPayload, type StepDraft } from "@/lib/step-form";
import { collectionFieldErrors, type RecipeCollectionValidation } from "@/lib/validations/recipeEditor";

type Props = { recipeId?: string; published?: boolean; parentVersion?: string; onChange?: (items: StepDraft[]) => void;
  onMutation?: () => Promise<void> | void; onDirtyChange?: (dirty: boolean) => void; validationRef?: Ref<RecipeCollectionValidation>; disabled?: boolean };
const toDraft = (step: StepDto): StepDraft => ({ stepId: step.id, title: step.title, description: step.description,
  timerMinutes: step.timerMinutes === null ? "" : String(step.timerMinutes), imageUrl: step.imageUrl ?? "" });
const signature = (step: StepDraft) => JSON.stringify([step.title, step.description, step.timerMinutes, step.imageUrl]);
const imagePreview = (value: string) => { try { return ["http:", "https:"].includes(new URL(value).protocol); } catch { return false; } };

export default function StepManager({ recipeId, published = false, parentVersion, onChange, onMutation, onDirtyChange, validationRef, disabled = false }: Props) {
  const form = useForm<{ items: StepDraft[] }>({ resolver: zodResolver(stepFormSchema), mode: "onBlur", defaultValues: { items: [] } });
  const { control, reset, getValues, setValue, trigger, setError: setFieldError, register, formState: { errors } } = form;
  useImperativeHandle(validationRef, () => ({
    validate: () => trigger(undefined, { shouldFocus: true }),
    setServerErrors: (errors, focus = true) => {
      const entries = collectionFieldErrors(errors, "steps", getValues("items").length, ["title", "description", "timerMinutes", "imageUrl"] as const);
      entries.forEach((entry, index) => setFieldError(`items.${entry.index}.${entry.field}`, { type: "server", message: entry.message }, { shouldFocus: focus && index === 0 }));
      return entries.length;
    },
  }), [trigger, getValues, setFieldError]);
  const { fields, append, remove, move } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const [version, setVersion] = useState("");
  const [acknowledgedParent, setAcknowledgedParent] = useState(parentVersion);
  const [loading, setLoading] = useState(Boolean(recipeId));
  const [busy, setBusy] = useState(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const mediaPending = useRef(false);
  const [imageTarget, setImageTarget] = useState(0);
  const [images, setImages] = useState<RecipeImageDto[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const mutationCallback = useRef(onMutation);
  useEffect(() => { mutationCallback.current = onMutation; }, [onMutation]);
  const [conflict, setConflict] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [failedImage, setFailedImage] = useState<Record<string, string>>({});
  const mounted = useRef(false);
  const locked = useRef(false);
  const baselines = useRef(new Map<string, string>());
  const changeCallback = useRef(onChange);
  useEffect(() => { changeCallback.current = onChange; }, [onChange]);
  useEffect(() => { if (!recipeId) changeCallback.current?.(items); }, [items, recipeId]);
  const isDirty = (rows: StepDraft[]) => rows.some(row => !row.stepId || signature(row) !== baselines.current.get(row.stepId));
  useEffect(() => {
    if (recipeId) onDirtyChange?.(mediaBusy || items.some(row => !row.stepId || signature(row) !== baselines.current.get(row.stepId)));
  }, [recipeId, items, version, mediaBusy, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    if (recipeId) void stepApi.list(recipeId, abort.signal).then(result => {
      if (abort.signal.aborted) return;
      const rows = result.items.map(toDraft);
      baselines.current = new Map(rows.map(row => [row.stepId!, signature(row)]));
      reset({ items: rows }); setVersion(result.etag);
    }).catch(() => { if (!abort.signal.aborted) setError("Không thể tải các bước hoặc bạn không có quyền truy cập."); })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => { mounted.current = false; abort.abort(); };
  }, [recipeId, reset]);

  const parentChanged = Boolean(recipeId && parentVersion !== acknowledgedParent && `"${parentVersion}"` !== version);
  const blocked = disabled || busy || mediaBusy || loading || conflict || parentChanged || Boolean(recipeId && !version);
  // Upload changes the recipe aggregate version. Read it without resetting local drafts.
  // Never adopt a version if another editor changed the persisted steps meanwhile.
  const mediaBusyChange = useCallback((active: boolean) => {
    if (active) { mediaPending.current = true; setMediaBusy(true); return; }
    if (!mediaPending.current || !recipeId || !mounted.current) return;
    mediaPending.current = false;
    void (async () => {
      try {
        const result = await stepApi.list(recipeId);
        if (!mounted.current) return;
        const rows = result.items.map(toDraft);
        const baseline = [...baselines.current];
        if (rows.length !== baseline.length || rows.some((row, index) => row.stepId !== baseline[index]?.[0] || signature(row) !== baseline[index]?.[1])) {
          setConflict(true);
          setError("Các bước đã thay đổi trong lúc tải ảnh. Nội dung đang nhập được giữ; hãy tải bản mới để kiểm tra.");
        } else setVersion(result.etag);
        setImages(await getRecipeImages(recipeId));
        await mutationCallback.current?.();
      } catch {
        if (mounted.current) { setConflict(true); setError("Chưa xác nhận được phiên bản sau upload. Nội dung vẫn được giữ; tải bản mới trước khi lưu bước."); }
      } finally { if (mounted.current) setMediaBusy(false); }
    })();
  }, [recipeId]);
  const chooseImage = (image: RecipeImageDto) => {
    const target = Math.min(imageTarget, getValues("items").length - 1);
    if (image.processingStatus !== "Completed" || target < 0) return;
    setValue(`items.${target}.imageUrl`, image.originalUrl, { shouldDirty: true, shouldValidate: true });
    setMessage(`Đã chọn ảnh cho bước ${target + 1}. Bấm Lưu bước để lưu liên kết.`);
  };
  const loadImages = async () => {
    if (!recipeId || imagesLoading || blocked) return;
    setImagesLoading(true);
    try { setImages(await getRecipeImages(recipeId)); }
    catch (cause) { setError(toApiProblemError(cause).message); }
    finally { setImagesLoading(false); }
  };
  const perform = async (action: () => Promise<void>) => {
    if (locked.current || mediaPending.current || blocked) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    try { await action(); if (mounted.current) { setMessage("Đã lưu các bước."); await onMutation?.(); } }
    catch (cause) {
      if (!mounted.current) return;
      const problem = toApiProblemError(cause);
      if (problem instanceof ApiProblemError && problem.status === 409) {
        setConflict(true); setError("Công thức đã thay đổi. Nội dung đang nhập được giữ lại; hãy sao chép nếu cần rồi tải bản mới.");
      } else if (!(problem instanceof ApiProblemError) || (problem.status ?? 500) >= 500) {
        // Network errors may arrive after a successful commit. Require a read before another POST.
        setConflict(true); setError("Chưa xác định được kết quả lưu. Nội dung vẫn được giữ; hãy tải bản mới để kiểm tra trước khi thử lại.");
      } else setError(problem.message + (problem.correlationId ? ` (Mã hỗ trợ: ${problem.correlationId})` : ""));
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  const reload = async () => {
    if (!recipeId || locked.current || mediaBusy || disabled) return;
    if (isDirty(getValues("items")) && !window.confirm("Tải bản mới sẽ bỏ các bước đang nhập chưa lưu. Tiếp tục?")) return;
    locked.current = true; setBusy(true);
    try {
      const result = await stepApi.list(recipeId);
      if (!mounted.current) return;
      const rows = result.items.map(toDraft);
      baselines.current = new Map(rows.map(row => [row.stepId!, signature(row)]));
      reset({ items: rows }); setVersion(result.etag); setAcknowledgedParent(parentVersion); setConflict(false); setError(""); setMessage("");
      await onMutation?.();
    } catch { if (mounted.current) setError("Không thể tải lại các bước. Vui lòng thử lại."); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  const save = async (index: number) => {
    if (!recipeId || blocked || locked.current || !await trigger(`items.${index}`, { shouldFocus: true })) return;
    const draft = getValues(`items.${index}`);
    await perform(async () => {
      const result = await stepApi.save(recipeId, draft.stepId, stepPayload(draft), version);
      if (!mounted.current) return;
      const next = getValues("items"); next[index] = toDraft(result.item);
      baselines.current.set(result.item.id, signature(next[index])); reset({ items: next }); setVersion(result.etag);
    });
  };
  const erase = async (index: number) => {
    if (blocked || locked.current) return;
    const row = getValues(`items.${index}`);
    if (!recipeId || !row.stepId) { remove(index); return; }
    if (!window.confirm(`Xóa bước ${index + 1}?`)) return;
    await perform(async () => {
      const nextVersion = await stepApi.remove(recipeId, row.stepId!, version);
      if (mounted.current) { remove(index); baselines.current.delete(row.stepId!); setVersion(nextVersion); }
    });
  };
  const reorder = async (from: number, to: number) => {
    if (blocked || locked.current) return;
    if (!recipeId) { move(from, to); return; }
    const rows = getValues("items");
    if (isDirty(rows)) { setError("Lưu các bước mới và nội dung đang sửa trước khi đổi thứ tự."); return; }
    const next = [...rows]; const [row] = next.splice(from, 1); next.splice(to, 0, row);
    await perform(async () => {
      const result = await stepApi.reorder(recipeId, next.map(item => item.stepId!), version);
      if (mounted.current) {
        const rows = result.items.map(toDraft);
        baselines.current = new Map(rows.map(row => [row.stepId!, signature(row)]));
        reset({ items: rows }); setVersion(result.etag);
      }
    });
  };
  const persistedCount = fields.filter(row => row.stepId).length;
  const fieldAccessibility = (index: number, key: "title" | "description" | "timerMinutes" | "imageUrl") => ({
    id: `step-${fields[index].id}-${key}`,
    "aria-invalid": Boolean(errors.items?.[index]?.[key]),
    "aria-describedby": errors.items?.[index]?.[key] ? `step-${fields[index].id}-${key}-error` : undefined,
  });

  return <section aria-label="Quản lý các bước thực hiện" className="space-y-4 rounded-2xl bg-white p-6 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xl font-semibold">Các bước thực hiện</h2>
      {recipeId && <button type="button" onClick={() => void reload()} disabled={busy || mediaBusy || disabled} className="rounded-lg border px-3 py-2">Tải các bước mới</button>}
    </div>
    <p className="text-sm text-muted-foreground">Tối đa 100 bước. Số thứ tự được hệ thống quản lý; tiêu đề để trống sẽ được đặt tự động.</p>
    {published && persistedCount === 1 && <p className="text-sm text-warning">Hãy hủy xuất bản trước khi xóa bước cuối cùng.</p>}
    {parentChanged && <p role="status" className="text-sm text-warning">Công thức vừa được cập nhật. Tải các bước mới trước khi tiếp tục.</p>}
    {loading && <p role="status">Đang tải các bước…</p>}
    {message && <p role="status" className="text-sm text-success">{message}</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <fieldset disabled={blocked} className="space-y-4 disabled:opacity-60">
      {fields.length === 0 && !loading && <p>Chưa có bước thực hiện. Bạn vẫn có thể lưu bản nháp.</p>}
      {fields.map((field, index) => <div key={field.id} className="space-y-3 rounded-xl border p-4" data-step-row>
        <h3 className="font-semibold">Bước {index + 1}{recipeId && !field.stepId ? " — chưa lưu" : ""}</h3>
        <label className="block text-sm">Tiêu đề bước {index + 1}<input {...register(`items.${index}.title`)} {...fieldAccessibility(index, "title")} maxLength={200} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="block text-sm">Mô tả bước {index + 1}<textarea {...register(`items.${index}.description`)} {...fieldAccessibility(index, "description")} maxLength={2000} rows={4} className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <p className="text-xs text-muted-foreground">{items[index]?.description?.length ?? 0}/2.000 ký tự</p>
        <label className="block text-sm">Hẹn giờ bước {index + 1} (phút, tùy chọn)<input {...register(`items.${index}.timerMinutes`)} {...fieldAccessibility(index, "timerMinutes")} inputMode="numeric" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <label className="block text-sm">URL ảnh bước {index + 1} (tùy chọn)<input {...register(`items.${index}.imageUrl`)} {...fieldAccessibility(index, "imageUrl")} maxLength={500} placeholder="https://…" className="mt-1 w-full rounded-lg border px-3 py-2" /></label>
        <p className="text-xs text-muted-foreground">Chọn hoặc tải ảnh trong mục Ảnh minh họa bước nấu bên dưới. URL ngoài phải là HTTP/HTTPS, không chứa thông tin đăng nhập.</p>
        {items[index]?.imageUrl && imagePreview(items[index].imageUrl) && <Image src={items[index].imageUrl} alt={`Ảnh xem trước bước ${index + 1}`} width={480} height={270} unoptimized className="max-h-48 w-auto rounded-lg object-contain"
          onError={() => setFailedImage(current => ({ ...current, [field.id]: items[index]?.imageUrl ?? "" }))} />}
        {items[index]?.imageUrl && failedImage[field.id] === items[index].imageUrl && <p className="text-sm text-warning">Không thể hiển thị ảnh. Kiểm tra URL và nguồn ảnh được website cho phép.</p>}
        {(["title", "description", "timerMinutes", "imageUrl"] as const).map(key => errors.items?.[index]?.[key]?.message && <p id={`step-${field.id}-${key}-error`} role="alert" className="text-sm text-destructive" key={key}>{errors.items[index]?.[key]?.message}</p>)}
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={index === 0} onClick={() => void reorder(index, index - 1)} aria-label={`Di chuyển bước ${index + 1} lên`} className="rounded-lg border px-3 py-2">Lên</button>
          <button type="button" disabled={index === fields.length - 1} onClick={() => void reorder(index, index + 1)} aria-label={`Di chuyển bước ${index + 1} xuống`} className="rounded-lg border px-3 py-2">Xuống</button>
          {recipeId && <button type="button" onClick={() => void save(index)} className="rounded-lg border px-3 py-2">Lưu bước {index + 1}</button>}
          <button type="button" disabled={published && persistedCount === 1 && Boolean(field.stepId)} onClick={() => void erase(index)} aria-label={`Xóa bước ${index + 1}`} className="rounded-lg border border-destructive/30 px-3 py-2 text-destructive">Xóa bước</button>
        </div>
      </div>)}
      <button type="button" disabled={fields.length >= 100} onClick={() => append(emptyStep())} className="rounded-lg border px-4 py-2">+ Thêm bước tiếp theo</button>
    </fieldset>
    {recipeId && fields.length > 0 ? <section aria-label="Ảnh minh họa bước nấu" className="space-y-3 rounded-xl border p-4">
      <h3 className="font-semibold">Ảnh minh họa bước nấu</h3>
      <label className="block text-sm">Bước nhận ảnh
        <select value={Math.min(imageTarget, fields.length - 1)} disabled={blocked} onChange={event => setImageTarget(Number(event.target.value))} className="mt-1 w-full rounded-lg border px-3 py-2">
          {fields.map((field, index) => <option key={field.id} value={index}>Bước {index + 1}</option>)}
        </select>
      </label>
      <button type="button" disabled={blocked || imagesLoading} onClick={() => void loadImages()} className="rounded-lg border px-3 py-2">{imagesLoading ? "Đang tải thư viện…" : "Tải thư viện ảnh để chọn"}</button>
      <div className="flex flex-wrap gap-2">{images.filter(image => image.processingStatus === "Completed").map((image, index) =>
        <button key={image.id} type="button" disabled={blocked} onClick={() => chooseImage(image)} className="max-w-full space-y-2 break-words rounded-lg border px-3 py-2">
          <Image src={image.thumbnailUrl ?? image.originalUrl} alt="" width={96} height={72} unoptimized className="rounded object-cover" />
          <span>Chọn ảnh {index + 1}{image.altText ? `: ${image.altText}` : ""}</span>
        </button>)}</div>
      <FileUploadDropzone recipeId={recipeId} disabled={disabled || busy || loading || conflict || parentChanged || !version} onUploadSuccess={chooseImage} onImagesChange={setImages} onBusyChange={mediaBusyChange} />
      <p className="text-xs text-muted-foreground">Ảnh dùng chung với thư viện công thức. Xóa bước chỉ bỏ liên kết, không xóa tệp ảnh. Chỉ ảnh xử lý hoàn tất mới được tự điền; lưu bước để ghi lại.</p>
    </section> : !recipeId && <p className="text-sm text-muted-foreground">Lưu bản nháp trước để tải/chọn ảnh cho từng bước.</p>}
  </section>;
}

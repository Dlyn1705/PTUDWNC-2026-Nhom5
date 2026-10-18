"use client";

import { useEffect, useRef, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ingredientApi, type IngredientDto } from "@/lib/api/ingredientApi";
import { emptyIngredient, ingredientFormSchema, ingredientPayload, type IngredientDraft } from "@/lib/ingredient-form";

type Props = {
  recipeId?: string;
  initialItems?: IngredientDraft[];
  onChange?: (items: IngredientDraft[]) => void;
  onMutation?: () => Promise<void> | void;
  /** Parent writes rotate the aggregate token. Ask for an explicit reload, never silently adopt it. */
  parentVersion?: string;
};
const toDraft = (item: IngredientDto): IngredientDraft => ({ ingredientId: item.id, name: item.name,
  quantity: item.quantity === null ? "" : String(item.quantity), unit: item.unit ?? "", notes: item.notes ?? "" });

export default function IngredientManager({ recipeId, initialItems = [], onChange, onMutation, parentVersion }: Props) {
  const form = useForm<{ items: IngredientDraft[] }>({ resolver: zodResolver(ingredientFormSchema), mode: "onBlur", defaultValues: { items: initialItems } });
  const { fields, append, remove, move, update, replace } = useFieldArray({ control: form.control, name: "items" });
  const { reset } = form;
  const items = useWatch({ control: form.control, name: "items" });
  const [etag, setEtag] = useState("");
  const [acknowledgedParent, setAcknowledgedParent] = useState(parentVersion);
  const [loading, setLoading] = useState(Boolean(recipeId));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const mounted = useRef(false);
  const locked = useRef(false);
  const callback = useRef(onChange);
  useEffect(() => { callback.current = onChange; }, [onChange]);
  useEffect(() => {
    if (!recipeId) callback.current?.(items);
  }, [items, recipeId]);

  useEffect(() => {
    mounted.current = true;
    const abort = new AbortController();
    if (recipeId) {
      void ingredientApi.list(recipeId, abort.signal).then(result => {
        if (abort.signal.aborted) return;
        reset({ items: result.items.map(toDraft) });
        setEtag(result.etag);
      }).catch(() => {
        if (!abort.signal.aborted) setError("Không thể tải nguyên liệu hoặc bạn không có quyền truy cập.");
      }).finally(() => { if (!abort.signal.aborted) setLoading(false); });
    }
    return () => { mounted.current = false; abort.abort(); };
  }, [recipeId, reset]);

  const reload = async () => {
    if (!recipeId || locked.current) return;
    if (form.formState.isDirty && !window.confirm("Tải bản mới sẽ bỏ các thay đổi nguyên liệu chưa lưu. Tiếp tục?")) return;
    locked.current = true;
    setBusy(true);
    try {
      const result = await ingredientApi.list(recipeId);
      if (!mounted.current) return;
      reset({ items: result.items.map(toDraft) });
      setEtag(result.etag); setAcknowledgedParent(parentVersion); setConflict(false); setError("");
    } catch { if (mounted.current) setError("Không thể tải lại nguyên liệu. Vui lòng thử lại."); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  const perform = async (action: () => Promise<void>) => {
    if (locked.current || !etag || conflict) return;
    locked.current = true;
    setBusy(true); setError("");
    try { await action(); if (mounted.current) await onMutation?.(); }
    catch (cause) {
      if (!mounted.current) return;
      const response = (cause as { response?: { status?: number; data?: { detail?: string } } }).response;
      if (response?.status === 409) {
        setConflict(true);
        setError("Công thức đã thay đổi ở nơi khác. Nội dung đang nhập vẫn được giữ; hãy sao chép nếu cần rồi tải bản mới.");
      } else setError(response?.data?.detail ?? "Không thể hoàn tất thao tác. Hãy tải lại để kiểm tra trạng thái trên máy chủ.");
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };

  const save = async (index: number) => {
    if (!recipeId || !await form.trigger(`items.${index}`)) return;
    const draft = form.getValues(`items.${index}`);
    await perform(async () => {
      const result = await ingredientApi.save(recipeId, draft.ingredientId, ingredientPayload(draft), etag);
      if (mounted.current) { update(index, toDraft(result.item)); setEtag(result.etag); }
    });
  };

  const erase = async (index: number) => {
    const item = form.getValues(`items.${index}`);
    if (!recipeId || !item.ingredientId) { remove(index); return; }
    if (!window.confirm(`Xóa nguyên liệu “${item.name}”?`)) return;
    await perform(async () => {
      const next = await ingredientApi.remove(recipeId, item.ingredientId!, etag);
      if (mounted.current) { remove(index); setEtag(next); }
    });
  };

  const reorder = async (from: number, to: number) => {
    if (!recipeId) { move(from, to); return; }
    const rows = form.getValues("items");
    if (rows.some(row => !row.ingredientId)) { setError("Lưu các hàng mới trước khi đổi thứ tự."); return; }
    const next = [...rows]; const [row] = next.splice(from, 1); next.splice(to, 0, row);
    await perform(async () => {
      const result = await ingredientApi.reorder(recipeId, next.map(item => item.ingredientId!), etag);
      // Preserve unsaved edits by moving the current form rows instead of replacing them from the server.
      if (mounted.current) { replace(next); setEtag(result.etag); }
    });
  };

  // A parent save invalidates the ingredient token. Keep drafts and require an explicit reload.
  const parentChanged = Boolean(recipeId && etag && parentVersion && parentVersion !== acknowledgedParent && etag !== `"${parentVersion}"`);
  const disabled = busy || loading || Boolean(recipeId && (!etag || conflict || parentChanged));

  return (
    <section className="space-y-4 rounded-2xl border bg-white p-6" aria-label="Quản lý nguyên liệu">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Nguyên liệu</h2>
        {recipeId && <button type="button" disabled={busy} onClick={() => void reload()} className="rounded-lg border px-3 py-2 disabled:opacity-50">Tải bản mới</button>}
      </div>
      <p className="text-sm text-gray-600">Để trống số lượng hoặc đơn vị khi nêm nếm vừa đủ. Tối đa 100 nguyên liệu.</p>
      {loading && <p role="status">Đang tải nguyên liệu…</p>}
      {parentChanged && <p role="status" className="text-sm text-amber-700">Công thức vừa được cập nhật. Tải bản mới trước khi tiếp tục quản lý nguyên liệu.</p>}
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <fieldset disabled={busy || loading || Boolean(recipeId && !etag)} className="space-y-4 disabled:opacity-60">
        {fields.length === 0 && !loading && <p>Chưa có nguyên liệu.</p>}
        {fields.map((field, index) => (
          <div key={field.id} className="space-y-3 rounded-xl border p-4">
            <p className="text-sm font-medium">Nguyên liệu {index + 1}{recipeId && !field.ingredientId ? " — chưa lưu" : ""}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {([ ["name", "Tên nguyên liệu"], ["quantity", "Số lượng (tùy chọn)"], ["unit", "Đơn vị (tùy chọn)"], ["notes", "Ghi chú (tùy chọn)"] ] as const).map(([key, label]) => (
                <label key={key} className="block text-sm">
                  {label}
                  <input {...form.register(`items.${index}.${key}`)} inputMode={key === "quantity" ? "decimal" : undefined}
                    aria-invalid={Boolean(form.formState.errors.items?.[index]?.[key])}
                    maxLength={key === "name" ? 200 : key === "unit" ? 50 : key === "notes" ? 500 : undefined}
                    className="mt-1 w-full rounded-lg border px-3 py-2" />
                  {form.formState.errors.items?.[index]?.[key]?.message && <span role="alert" className="text-red-600">{form.formState.errors.items[index]?.[key]?.message}</span>}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={disabled || index === 0} onClick={() => void reorder(index, index - 1)} aria-label={`Di chuyển nguyên liệu ${index + 1} lên`} className="rounded-lg border px-3 py-2 disabled:opacity-50">Lên</button>
              <button type="button" disabled={disabled || index === fields.length - 1} onClick={() => void reorder(index, index + 1)} aria-label={`Di chuyển nguyên liệu ${index + 1} xuống`} className="rounded-lg border px-3 py-2 disabled:opacity-50">Xuống</button>
              {recipeId && <button type="button" disabled={disabled} onClick={() => void save(index)} className="rounded-lg border px-3 py-2 disabled:opacity-50">Lưu hàng {index + 1}</button>}
              <button type="button" disabled={disabled} onClick={() => void erase(index)} aria-label={`Xóa nguyên liệu ${index + 1}`} className="rounded-lg border px-3 py-2 text-red-600 disabled:opacity-50">Xóa</button>
            </div>
          </div>
        ))}
        <button type="button" disabled={disabled || fields.length >= 100} onClick={() => append(emptyIngredient())} className="rounded-lg border px-4 py-2 disabled:opacity-50">+ Thêm nguyên liệu</button>
      </fieldset>
    </section>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { getApiErrorMessage, isApiProblemError, toApiProblemError } from "@/lib/api/problemDetails";
import { recipeEditorSchema, emptyRecipeEditor, nutritionFields, recipeErrorField, RecipeFormValidationError,
  type RecipeEditorValues, type RecipeEditorField } from "@/lib/validations/recipeEditor";
import type { CategoryDto } from "@/types/category.types";

type Props = {
  mode: "create" | "edit";
  defaultValues?: Partial<RecipeEditorValues>;
  categories: CategoryDto[];
  categoriesLoading?: boolean;
  categoryError?: unknown;
  onRetryCategories: () => void;
  onSave: (values: RecipeEditorValues) => Promise<void>;
  onDirtyChange: (dirty: boolean) => void;
  onReload?: () => void;
  disabled?: boolean;
  busy?: boolean;
  blockSubmit?: boolean;
  createdSlug?: string;
  onEdited?: () => void;
  onCollectionErrors?: (errors: Record<string, string[]>, focus: boolean) => void;
  children?: ReactNode;
  actions?: ReactNode;
};
type SaveProblem = { status?: number; message: string; correlationId?: string };
const labels: Record<RecipeEditorField, string> = {
  title: "Tên món ăn", description: "Mô tả", instructions: "Hướng dẫn", categoryId: "Danh mục", difficulty: "Độ khó",
  prepTime: "Chuẩn bị (phút)", cookTime: "Nấu (phút)", servings: "Khẩu phần",
  calories: "Calories", protein: "Protein", carbohydrates: "Carbohydrates", fat: "Chất béo", fiber: "Chất xơ", sodium: "Natri",
};
const fieldOrder: RecipeEditorField[] = ["title", "categoryId", "difficulty", "description", "instructions", "prepTime", "cookTime", "servings", ...nutritionFields];

export default function RecipeForm(props: Props) {
  const { mode, onDirtyChange, onSave, onCollectionErrors } = props;
  const prefix = useId();
  const form = useForm<RecipeEditorValues>({ resolver: zodResolver(recipeEditorSchema),
    defaultValues: { ...emptyRecipeEditor, ...props.defaultValues }, shouldFocusError: false });
  const { register, handleSubmit, setError, setFocus, reset, clearErrors, formState: { errors, isDirty, isSubmitting } } = form;
  const title = useWatch({ control: form.control, name: "title" });
  const categoryId = useWatch({ control: form.control, name: "categoryId" });
  const saving = useRef(false);
  const pendingFocus = useRef<{ first?: RecipeEditorField; errors: Record<string, string[]> } | null>(null);
  const [problem, setProblem] = useState<SaveProblem | null>(null);
  const [callbackUrl, setCallbackUrl] = useState("");
  const locked = isSubmitting || props.busy;
  const conflict = mode === "edit" && problem?.status === 409;
  useEffect(() => { onDirtyChange(isDirty); }, [isDirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  useEffect(() => {
    if (locked || !pendingFocus.current) return;
    const pending = pendingFocus.current;
    pendingFocus.current = null;
    if (pending.first) setFocus(pending.first);
    onCollectionErrors?.(pending.errors, !pending.first);
  }, [locked, problem, errors, setFocus, onCollectionErrors]);

  const inputId = (name: RecipeEditorField) => {
    const nutritionIndex = nutritionFields.indexOf(name as typeof nutritionFields[number]);
    const suffix = nutritionIndex >= 0 ? `nutrition-${nutritionIndex}` : name === "categoryId" ? "category" : name;
    return `${prefix}-${mode === "create" ? "new" : "edit"}-${suffix}`;
  };
  const field = (name: RecipeEditorField, hint = false) => ({
    ...register(name), id: inputId(name), "aria-invalid": Boolean(errors[name]),
    "aria-describedby": [hint ? `${inputId(name)}-hint` : "", errors[name] ? `${inputId(name)}-error` : ""].filter(Boolean).join(" ") || undefined,
  });
  const fieldError = (name: RecipeEditorField) => errors[name]?.message
    ? <p role="alert" id={`${inputId(name)}-error`} className="mt-1 text-sm text-destructive">{errors[name]?.message}</p> : null;
  const inputClass = "mt-2 w-full rounded-xl border border-input bg-card px-4 py-3 text-foreground focus-visible:outline-2 focus-visible:outline-primary disabled:bg-muted";

  const submit = async (data: RecipeEditorValues) => {
    if (saving.current || props.disabled || props.busy || props.blockSubmit || conflict || props.categoriesLoading || props.categoryError || props.categories.length === 0) return;
    saving.current = true;
    clearErrors(); setProblem(null);
    try {
      await onSave(data);
      reset(data);
    } catch (reason) {
      if (reason instanceof RecipeFormValidationError) {
        setProblem({ status: 422, message: getApiErrorMessage(reason) });
        return;
      }
      const error = isApiProblemError(reason) ? reason : toApiProblemError(reason);
      const status = error.status;
      if (status === 400 || status === 422) {
        const mapped = new Set<RecipeEditorField>();
        for (const [key, messages] of Object.entries(error.errors)) {
          const name = recipeErrorField(key);
          if (!name || !messages.length || (mode === "edit" && nutritionFields.includes(name as typeof nutritionFields[number])) ||
            (mode === "create" && name === "instructions")) continue;
          setError(name, { type: "server", message: messages.join(" ") });
          mapped.add(name);
        }
        const first = fieldOrder.find(name => mapped.has(name));
        // Inputs inside a disabled fieldset cannot receive focus until submit ends.
        pendingFocus.current = { first, errors: error.errors };
      }
      const message = status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại."
        : status === 403 ? "Bạn không có quyền lưu công thức này."
        : status === 409 ? "Công thức đã được người khác thay đổi. Nội dung đang nhập vẫn được giữ; hãy tải bản mới trước khi lưu."
        : status === 400 || status === 422 ? "Dữ liệu chưa hợp lệ. Hãy kiểm tra các ô được đánh dấu, nguyên liệu và các bước thực hiện."
        : status === 404 ? "Công thức hoặc danh mục không còn tồn tại. Hãy tải lại để kiểm tra."
        : "Không thể lưu công thức lúc này. Vui lòng thử lại sau ít phút.";
      setCallbackUrl(window.location.pathname + window.location.search);
      setProblem({ status, message, correlationId: error.correlationId });
    } finally { saving.current = false; }
  };

  return <form noValidate className="space-y-6" onChange={props.onEdited} onSubmit={event => {
    void handleSubmit(submit, invalidFields => {
      // Resolver validation also runs while the fieldset is disabled. Focus only
      // after React commits the enabled inputs, just as for API field errors.
      pendingFocus.current = { first: fieldOrder.find(name => invalidFields[name]), errors: {} };
    })(event);
  }} aria-busy={locked}>
    {problem && <ErrorState title="Không thể lưu công thức" description={problem.message} correlationId={problem.correlationId}
      focusOnMount={problem.status !== 400 && problem.status !== 422}
      action={problem.status === 401
        ? <Link className="rounded-lg border px-4 py-2 underline" href={`/auth/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}>Đăng nhập lại</Link>
        : conflict && props.onReload ? <button type="button" aria-label="Tải bản công thức mới" className="rounded-lg border px-4 py-2" onClick={props.onReload}>Tải bản mới</button> : undefined} />}
    <fieldset disabled={locked || props.disabled} aria-label="Thông tin cơ bản" className="min-w-0 space-y-5 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Thông tin cơ bản</h2>
      <div>
        <label htmlFor={inputId("title")} className="block text-sm font-medium">{mode === "create" ? "Tên món ăn *" : labels.title}</label>
        <input {...field("title", true)} required maxLength={200} className={inputClass} placeholder="Ví dụ: Phở bò truyền thống" />
        <p id={`${inputId("title")}-hint`} className="mt-1 text-xs text-muted-foreground">Từ 3 đến 200 ký tự. {title.length}/200</p>
        {fieldError("title")}
      </div>
      {mode === "create" && <div><label htmlFor={`${prefix}-slug`} className="block text-sm font-medium">Slug SEO (xem trước)</label>
        <input id={`${prefix}-slug`} readOnly className={inputClass} value={props.createdSlug || title.toLowerCase().replace(/đ/g, "d").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")} /></div>}
      <div className="grid gap-5 sm:grid-cols-2">
        <div><label htmlFor={inputId("categoryId")} className="block text-sm font-medium">{mode === "create" ? "Danh mục *" : labels.categoryId}</label>
          <select {...field("categoryId")} required disabled={locked || props.disabled || props.categoriesLoading || Boolean(props.categoryError)} className={inputClass}>
            <option value="">Chọn danh mục</option>
            {categoryId && !props.categories.some(item => item.id === categoryId) && <option value={categoryId} disabled>Danh mục hiện tại không khả dụng — hãy chọn lại</option>}
            {props.categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>{fieldError("categoryId")}
          {props.categoriesLoading && <LoadingState label="Đang tải danh mục…" />}
          {props.categoryError ? <ErrorState title="Không thể tải danh mục" description="Thông tin đang nhập được giữ nguyên. Hãy thử tải lại danh mục."
            onRetry={props.onRetryCategories} /> : !props.categoriesLoading && props.categories.length === 0 && <p role="status" className="mt-2 text-sm">Chưa có danh mục để chọn. Hãy liên hệ quản trị viên.</p>}
        </div>
        <div><label htmlFor={inputId("difficulty")} className="block text-sm font-medium">Độ khó</label>
          <select {...field("difficulty")} className={inputClass}><option value="1">Dễ</option><option value="2">Trung bình</option><option value="3">Khó</option><option value="4">Chuyên gia</option></select>{fieldError("difficulty")}</div>
      </div>
      {(["description", ...(mode === "edit" ? ["instructions"] : [])] as ("description" | "instructions")[]).map(name => <div key={name}>
        <label htmlFor={inputId(name)} className="block text-sm font-medium">{name === "description" && mode === "create" ? "Mô tả ngắn" : labels[name]}</label>
        <textarea {...field(name)} rows={name === "description" ? 4 : 6} maxLength={name === "description" ? 2000 : 10000} className={inputClass} />{fieldError(name)}
      </div>)}
      <div className="grid gap-5 sm:grid-cols-3">{(["prepTime", "cookTime", "servings"] as const).map(name => <div key={name}>
        <label htmlFor={inputId(name)} className="block text-sm font-medium">{labels[name]}</label>
        <input {...field(name)} type="number" min={name === "servings" ? 1 : 0} max={2147483647} step={1} placeholder={name === "servings" ? "4" : name === "prepTime" ? "15" : "30"} className={inputClass} />{fieldError(name)}
      </div>)}</div>
    </fieldset>
    <fieldset disabled={locked || props.disabled} aria-label="Thông tin dinh dưỡng" className="min-w-0 rounded-2xl bg-white p-6 shadow-sm">
      <h2 className="text-xl font-semibold">Thông tin dinh dưỡng</h2><div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {nutritionFields.map(name => <div key={name}><label htmlFor={inputId(name)} className="block text-sm font-medium">{labels[name]}</label>
          <div className="relative"><input {...field(name)} type="number" min={0} max={999999.99} step="0.01" className={`${inputClass} pr-14`} />
            <span aria-hidden="true" className="absolute right-4 top-1/2 text-sm text-muted-foreground">{name === "calories" ? "kcal" : name === "sodium" ? "mg" : "g"}</span>
          </div>{fieldError(name)}</div>)}
      </div>
    </fieldset>
    {props.children}
    <div className="flex flex-wrap justify-between gap-3">
      {props.actions && <fieldset disabled={locked} aria-label="Thao tác công thức" className="contents">{props.actions}</fieldset>}
      <button type="submit" disabled={locked || props.disabled || props.blockSubmit || conflict || props.categoriesLoading || Boolean(props.categoryError) || props.categories.length === 0}
        className="ml-auto rounded-xl bg-primary px-6 py-3 font-medium text-primary-foreground disabled:opacity-60">
        {locked ? "Đang lưu..." : props.disabled && mode === "create" ? "Đã lưu" : mode === "create" ? "Lưu bản nháp" : "Lưu thay đổi"}
      </button>
    </div>
  </form>;
}

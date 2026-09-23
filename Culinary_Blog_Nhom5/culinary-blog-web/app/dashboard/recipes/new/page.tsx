"use client";

import { useMemo, useState } from "react";

type Ingredient = {
  name: string;
  quantity: string;
  unit: string;
};

type Step = {
  description: string;
};

export default function NewRecipePage() {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [difficulty, setDifficulty] = useState("Easy");

  const [prepTime, setPrepTime] = useState("");
  const [cookTime, setCookTime] = useState("");
  const [servings, setServings] = useState("");

  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [fiber, setFiber] = useState("");
  const [sodium, setSodium] = useState("");

  const [image, setImage] = useState<string | null>(null);

  const [ingredients, setIngredients] = useState<Ingredient[]>([
    { name: "", quantity: "", unit: "" },
  ]);

  const [steps, setSteps] = useState<Step[]>([
    { description: "" },
  ]);

  const slug = useMemo(() => {
    return title
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");
  }, [title]);

  const addIngredient = () => {
    setIngredients([
      ...ingredients,
      { name: "", quantity: "", unit: "" },
    ]);
  };

  const removeIngredient = (index: number) => {
    if (ingredients.length === 1) return;

    setIngredients(
      ingredients.filter((_, i) => i !== index)
    );
  };

  const updateIngredient = (
    index: number,
    field: keyof Ingredient,
    value: string
  ) => {
    const updated = [...ingredients];
    updated[index][field] = value;
    setIngredients(updated);
  };

  const addStep = () => {
    setSteps([...steps, { description: "" }]);
  };

  const removeStep = (index: number) => {
    if (steps.length === 1) return;

    setSteps(steps.filter((_, i) => i !== index));
  };

  const updateStep = (index: number, value: string) => {
    const updated = [...steps];
    updated[index].description = value;
    setSteps(updated);
  };

  const handleImageChange = (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0];

    if (!file) return;

    const url = URL.createObjectURL(file);
    setImage(url);
  };

  const handleSubmit = (status: "draft" | "continue") => {
  // Kiểm tra tên món ăn
  if (title.trim().length < 3) {
    alert("Tên món ăn phải có ít nhất 3 ký tự.");
    return;
  }

  // Kiểm tra danh mục
  if (!category) {
    alert("Vui lòng chọn danh mục.");
    return;
  }

  // Kiểm tra thời gian
  if (prepTime && Number(prepTime) < 0) {
    alert("Thời gian chuẩn bị không hợp lệ.");
    return;
  }

  if (cookTime && Number(cookTime) < 0) {
    alert("Thời gian nấu không hợp lệ.");
    return;
  }

  // Kiểm tra nguyên liệu
  const invalidIngredient = ingredients.some(
    (ingredient) => !ingredient.name.trim()
  );

  if (invalidIngredient) {
    alert("Vui lòng nhập đầy đủ tên nguyên liệu.");
    return;
  }

  // Kiểm tra các bước
  const invalidStep = steps.some(
    (step) => !step.description.trim()
  );

  if (invalidStep) {
    alert("Vui lòng nhập đầy đủ nội dung các bước thực hiện.");
    return;
  }

  const recipeData = {
    title: title.trim(),
    slug,
    description: description.trim(),
    category,
    difficulty,
    prepTime: Number(prepTime) || 0,
    cookTime: Number(cookTime) || 0,
    servings: Number(servings) || 0,
    nutrition: {
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      fiber: Number(fiber) || 0,
      sodium: Number(sodium) || 0,
    },
    ingredients,
    steps,
    status,
  };

  console.log("Recipe data:", recipeData);

  alert(
    status === "draft"
      ? "Đã lưu công thức dưới dạng bản nháp!"
      : "Đã lưu. Bạn có thể tiếp tục chỉnh sửa."
  );
};
}
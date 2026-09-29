/**
 * Electryve Product Form Script
 * Coordinates dynamic variant creation, field mapping, client-side validation,
 * and integration with ProductImageManager.
 */

const variantContainer = document.getElementById("variantContainer");
const variantTemplate = document.getElementById("variantTemplate");
const addVariantBtn = document.getElementById("addVariantBtn");

const MAX_VARIANTS = 10;
const variants = window.existingVariants || [];

if (variants.length > 0) {
    variants.forEach(variant => {
        createVariant(variant);
    });
} else {
    createVariant();
}

if (addVariantBtn) {
    addVariantBtn.addEventListener("click", () => {
        if (variantContainer.children.length >= MAX_VARIANTS) {
            if (window.showWarning) {
                window.showWarning("Maximum 10 variants allowed.");
            } else {
                alert("Maximum 10 variants allowed.");
            }
            return;
        }
        createVariant();
    });
}

function createVariant(data = {}) {
    if (!variantTemplate) return;

    const clone = variantTemplate.content.cloneNode(true);
    const card = clone.querySelector(".variant-card");

    // Populate field values
    const colorField = card.querySelector('[data-field="color"]');
    if (colorField) colorField.value = data.color || "";

    const storageField = card.querySelector('[data-field="storage"]');
    if (storageField) storageField.value = data.storage || "";

    const skuField = card.querySelector('[data-field="sku"]');
    if (skuField) skuField.value = data.sku || "";

    const regularPriceField = card.querySelector('[data-field="regularPrice"]');
    if (regularPriceField) regularPriceField.value = data.regularPrice !== undefined ? data.regularPrice : "";

    const salePriceField = card.querySelector('[data-field="salePrice"]');
    if (salePriceField) salePriceField.value = data.salePrice !== undefined ? data.salePrice : "";

    const stockField = card.querySelector('[data-field="stock"]');
    if (stockField) stockField.value = data.stock !== undefined ? data.stock : "";

    // Initialize variant ID and Image State in ImageManager
    ImageManager.ensureVariantId(card);
    const existingImages = (window.isEditPage && data.images && Array.isArray(data.images)) ? data.images : [];
    ImageManager.initVariant(card, existingImages);

    // Bind file input change for variant images
    const imageInput = card.querySelector(".variantImages");
    if (imageInput) {
        imageInput.addEventListener("change", (event) => {
            ImageManager.handleFileSelect(event, card);
        });
    }

    // Bind remove variant button
    const removeBtn = card.querySelector(".removeVariant");
    if (removeBtn) {
        removeBtn.addEventListener("click", () => {
            ImageManager.destroyVariant(card);
            card.remove();
            updateVariants();
        });
    }

    // Subtitle live updating
    const colorInput = card.querySelector(".variant-color");
    const capacityInput = card.querySelector(".variant-capacity");
    const subtitle = card.querySelector(".variant-subtitle");

    function updateSubtitle() {
        if (!subtitle) return;
        const color = colorInput ? colorInput.value.trim() : "";
        const capacity = capacityInput ? capacityInput.value.trim() : "";
        if (color || capacity) {
            subtitle.textContent = `${color} ${color && capacity ? "•" : ""} ${capacity}`;
        } else {
            subtitle.textContent = "New Variant";
        }
    }

    if (colorInput) colorInput.addEventListener("input", updateSubtitle);
    if (capacityInput) capacityInput.addEventListener("input", updateSubtitle);
    updateSubtitle();

    variantContainer.appendChild(clone);
    updateVariants();
}

function updateVariants() {
    const cards = variantContainer.querySelectorAll(".variant-card");

    cards.forEach((card, index) => {
        const titleEl = card.querySelector(".variant-title");
        if (titleEl) {
            titleEl.textContent = `Variant ${index + 1}`;
        }

        const removeBtn = card.querySelector(".removeVariant");
        if (removeBtn) {
            if (cards.length === 1) {
                removeBtn.classList.add("d-none");
            } else {
                removeBtn.classList.remove("d-none");
            }
        }

        // Map form input names to variants[index][field]
        card.querySelectorAll("[data-field]").forEach(input => {
            const field = input.dataset.field;
            input.name = `variants[${index}][${field}]`;
        });

        // Sync image input names & existing image tokens via ImageManager
        ImageManager.syncVariantIndex(card, index);
    });
}

// Make updateVariants available globally
window.updateVariants = updateVariants;

// Form Submit Handling
const productForm = document.getElementById("productForm");

if (productForm) {
    productForm.addEventListener("submit", function (e) {
        const validation = validateForm();
        if (!validation.isValid) {
            e.preventDefault();
            if (window.showError) {
                window.showError(validation.message);
            } else {
                alert(validation.message);
            }
            return;
        }
    });
}

function validateForm() {
    const nameInput = document.querySelector('[name="name"]');
    const productName = nameInput ? nameInput.value.trim() : "";

    if (!productName) {
        return {
            isValid: false,
            message: "Product name is required."
        };
    }

    if (productName.length < 3) {
        return {
            isValid: false,
            message: "Product name must contain at least 3 characters."
        };
    }

    const descInput = document.querySelector('[name="description"]');
    const description = descInput ? descInput.value.trim() : "";
    if (!description) {
        return {
            isValid: false,
            message: "Product description is required."
        };
    }
    if (description.length < 10) {
        return {
            isValid: false,
            message: "Description must be at least 10 characters."
        };
    }

    const categorySelect = document.querySelector('[name="category"]');
    if (!categorySelect || !categorySelect.value.trim()) {
        return {
            isValid: false,
            message: "Please select a category."
        };
    }

    const brandSelect = document.querySelector('[name="brand"]');
    if (!brandSelect || !brandSelect.value.trim()) {
        return {
            isValid: false,
            message: "Please select a brand."
        };
    }

    const variantValidation = validateVariants();
    if (!variantValidation.isValid) {
        return variantValidation;
    }

    return {
        isValid: true,
        message: ""
    };
}

function validateVariants() {
    const cards = document.querySelectorAll(".variant-card");
    if (cards.length === 0) {
        return {
            isValid: false,
            message: "At least one variant is required."
        };
    }

    const skuSet = new Set();
    const variantSet = new Set();
    const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
    const MAX_SIZE = 2 * 1024 * 1024;

    for (let i = 0; i < cards.length; i++) {
        const card = cards[i];
        const variantNum = i + 1;

        const colorInput = card.querySelector('[data-field="color"]');
        const color = colorInput ? colorInput.value.trim() : "";
        if (!color) {
            return {
                isValid: false,
                message: `Color is required for Variant ${variantNum}.`
            };
        }

        const storageInput = card.querySelector('[data-field="storage"]');
        const storage = storageInput ? storageInput.value.trim() : "";
        if (!storage) {
            return {
                isValid: false,
                message: `Capacity / Storage is required for Variant ${variantNum}.`
            };
        }

        const skuInput = card.querySelector('[data-field="sku"]');
        const sku = skuInput ? skuInput.value.trim().toUpperCase() : "";
        if (!sku) {
            return {
                isValid: false,
                message: `SKU is required for Variant ${variantNum}.`
            };
        }

        const regularPriceInput = card.querySelector('[data-field="regularPrice"]');
        const regularPrice = regularPriceInput ? Number(regularPriceInput.value) : 0;
        if (!regularPriceInput || regularPriceInput.value === "" || isNaN(regularPrice) || regularPrice <= 0) {
            return {
                isValid: false,
                message: `Regular price must be greater than 0 for Variant ${variantNum}.`
            };
        }

        const salePriceInput = card.querySelector('[data-field="salePrice"]');
        const salePrice = salePriceInput ? Number(salePriceInput.value) : 0;
        if (!salePriceInput || salePriceInput.value === "" || isNaN(salePrice) || salePrice <= 0) {
            return {
                isValid: false,
                message: `Sale price must be greater than 0 for Variant ${variantNum}.`
            };
        }

        if (salePrice > regularPrice) {
            return {
                isValid: false,
                message: `Sale price cannot exceed regular price for Variant ${variantNum}.`
            };
        }

        const stockInput = card.querySelector('[data-field="stock"]');
        const stock = stockInput ? Number(stockInput.value) : -1;
        if (!stockInput || stockInput.value === "" || isNaN(stock) || stock < 0) {
            return {
                isValid: false,
                message: `Stock cannot be negative for Variant ${variantNum}.`
            };
        }

        // Validate image count via ImageManager
        const totalImages = ImageManager.getVariantImageCount(card);
        if (totalImages < 3) {
            return {
                isValid: false,
                message: `Variant ${variantNum} must have at least 3 images (currently has ${totalImages}).`
            };
        }

        if (totalImages > 5) {
            return {
                isValid: false,
                message: `Variant ${variantNum} exceeds the maximum limit of 5 images (currently has ${totalImages}).`
            };
        }

        // Validate image files format & size
        const variantFiles = ImageManager.getVariantFiles(card);
        for (const file of variantFiles) {
            if (file.type && !allowedTypes.includes(file.type)) {
                return {
                    isValid: false,
                    message: `Variant ${variantNum} contains an invalid file "${file.name}". Only JPG, PNG, and WebP are allowed.`
                };
            }
            if (file.size > MAX_SIZE) {
                return {
                    isValid: false,
                    message: `Variant ${variantNum} image "${file.name}" exceeds the 2 MB limit.`
                };
            }
        }

        // Check for duplicate SKUs
        if (skuSet.has(sku)) {
            return {
                isValid: false,
                message: `Duplicate SKU detected: "${sku}". Each variant must have a unique SKU.`
            };
        }
        skuSet.add(sku);

        // Check for duplicate Color + Storage
        const key = `${color.toLowerCase()}-${storage.toLowerCase()}`;
        if (variantSet.has(key)) {
            return {
                isValid: false,
                message: `Duplicate variant combination: "${color} - ${storage}". Each variant must have a unique Color and Storage combination.`
            };
        }
        variantSet.add(key);
    }

    return {
        isValid: true,
        message: ""
    };
}

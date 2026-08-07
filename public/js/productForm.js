
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

addVariantBtn.addEventListener("click", () => {

    if (variantContainer.children.length >= MAX_VARIANTS) {

        showWarning("Maximum 10 variants allowed.");

        return;

    }

    createVariant();

});

function createVariant(data = {}) {

    const clone = variantTemplate.content.cloneNode(true);

    const card = clone.querySelector(".variant-card");

    // Fill input fields
    card.querySelector('[data-field="color"]').value =
        data.color || "";

    card.querySelector('[data-field="storage"]').value =
        data.storage || "";

    card.querySelector('[data-field="sku"]').value =
        data.sku || "";

    card.querySelector('[data-field="regularPrice"]').value =
        data.regularPrice || "";

    card.querySelector('[data-field="salePrice"]').value =
        data.salePrice || "";

    card.querySelector('[data-field="stock"]').value =
        data.stock || "";

    // Existing Images (Edit Page Only)
    if (window.isEditPage && data.images?.length) {

        const previewContainer =
            card.querySelector(".existingImageContainer");
        data.images.forEach((image, imageIndex) => {

            const col = document.createElement("div");

            col.className = "col-md-3 mb-3";

            col.innerHTML = `
                <div class="card shadow-sm position-relative">

                    <img
                        src="${image}"
                        class="card-img-top"
                        style="height:180px;object-fit:cover;">

                    <div class="position-absolute top-0 end-0 d-flex flex-column gap-1 m-2">

                        <button
                            type="button"
                            class="btn btn-primary btn-sm replaceExistingImage">

                            <i class="bi bi-arrow-repeat"></i>

                        </button>

                        <button
                            type="button"
                            class="btn btn-danger btn-sm removeExistingImage">

                            <i class="bi bi-x"></i>

                        </button>

                    </div>

                </div>

                <input
                    type="hidden"
                    data-existing-image
                    value="${image}">
            `;

            previewContainer.appendChild(col);
            const removeImageBtn = col.querySelector(".removeExistingImage");
            const replaceImageBtn = col.querySelector(".replaceExistingImage");

            const hiddenInput =
                col.querySelector("[data-existing-image]");

            removeImageBtn.addEventListener("click", () => {

                const img = col.querySelector("img");
                if (img && img.src.startsWith("blob:")) {
                    URL.revokeObjectURL(img.src);
                }

                hiddenInput.remove();

                col.remove();
                
                updateVariants();

            });

            replaceImageBtn.addEventListener("click", () => {
                const imgElement = col.querySelector("img");
                ImageManager.startReplace('existing', card, col, image, imgElement);
            });

        });

    }

    variantContainer.appendChild(clone);

    updateVariants();

}

function updateVariants() {

    const cards = variantContainer.querySelectorAll(".variant-card");

    cards.forEach((card, index) => {

        card.querySelector(".variant-title").textContent = `Variant ${index + 1}`;

        const removeBtn = card.querySelector(".removeVariant");

        if(index===0){

            removeBtn.classList.add("d-none");

        }else{

            removeBtn.classList.remove("d-none");

        }

        card.querySelectorAll("[data-field]").forEach(input=>{

            const field=input.dataset.field;

            input.name=`variants[${index}][${field}]`;

        });
        const existingCols = card.querySelectorAll(".existingImageContainer > div");
        existingCols.forEach((col, imgIndex) => {
            const existingInput = col.querySelector("[data-existing-image]");
            if (existingInput) {
                existingInput.name = `variants[${index}][existingImages][]`;
            }
            const replaceInput = col.querySelector(".replace-image-file-input");
            if (replaceInput) {
                replaceInput.name = `replaceImage_${index}_${imgIndex}`;
            }
            const replaceTargetInput = col.querySelector(".replace-target-input");
            if (replaceTargetInput) {
                replaceTargetInput.name = `replaceTarget_${index}_${imgIndex}`;
            }
        });

        const imageInput=card.querySelector(".variantImages");

        imageInput.name=`variantImages_${index}`;

        imageInput.onchange = (event) => {

            ImageManager.selectImages(event);

        };

        removeBtn.onclick=()=>{

            card.remove();

            updateVariants();

        };

        const colorInput=card.querySelector(".variant-color");

        const capacityInput=card.querySelector(".variant-capacity");
        

        function updateSubtitle(){

            const color=colorInput.value.trim();

            const capacity=capacityInput.value.trim();

            const subtitle=card.querySelector(".variant-subtitle");

            if(color || capacity){

                subtitle.textContent=`${color} ${color && capacity ? "•" : ""} ${capacity}`;

            }else{

                subtitle.textContent="New Variant";

            }

        }

        colorInput.oninput=updateSubtitle;

        capacityInput.oninput=updateSubtitle;

        updateSubtitle();

    });

}




const productForm = document.getElementById("productForm");

if (productForm) {

    productForm.addEventListener("submit", function (e) {

        const validation = validateForm();

        if (!validation.isValid) {

            e.preventDefault();

            showError(validation.message);

        }

    });

}


function validateForm() {

    const productName =
        document.querySelector('[name="name"]').value.trim();

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

    const skuSet = new Set();
    const variantSet = new Set();

    for (const card of cards) {

        const color = card.querySelector('[data-field="color"]').value.trim();

        const storage = card.querySelector('[data-field="storage"]').value.trim();

        const sku = card.querySelector('[data-field="sku"]').value.trim().toUpperCase();
        const regularPrice = Number(
    card.querySelector('[data-field="regularPrice"]').value
);

const salePrice = Number(
    card.querySelector('[data-field="salePrice"]').value
);

const stock = Number(
    card.querySelector('[data-field="stock"]').value
);
const imageInput = card.querySelector(".variantImages");

const files = [...imageInput.files];

const replaceFileInputs = card.querySelectorAll(".replace-image-file-input");
const replacementFiles = [];
replaceFileInputs.forEach(input => {
    if (input.files && input.files.length > 0) {
        replacementFiles.push(input.files[0]);
    }
});

// Count existing images (Edit page)
const existingImages = card.querySelectorAll(
    'input[data-existing-image]'
).length;

const totalImages = existingImages + files.length;

if (totalImages < 3) {

    return {

        isValid: false,

        message: "Each variant must contain at least 3 images."

    };

}

if (totalImages > 5) {

    return {

        isValid: false,

        message: "Maximum 5 images are allowed per variant."

    };

}

const allowedTypes = [

    "image/jpeg",

    "image/png",

    "image/webp"

];

const MAX_SIZE = 2 * 1024 * 1024;

for (const file of [...files, ...replacementFiles]) {

    if (!allowedTypes.includes(file.type)) {

        return {

            isValid: false,

            message: "Only JPG, PNG and WEBP images are allowed."

        };

    }

    if (file.size > MAX_SIZE) {

        return {

            isValid: false,

            message: "Each image must be smaller than 2 MB."

        };

    }

}
        if (skuSet.has(sku)) {

            return {
                isValid: false,
                message: `Duplicate SKU : ${sku}`
            };

        }

        skuSet.add(sku);

        const key = `${color.toLowerCase()}-${storage.toLowerCase()}`;

        if (variantSet.has(key)) {

            return {
                isValid: false,
                message: `Duplicate Variant : ${color} ${storage}`
            };

        }

        variantSet.add(key);

    }

    return {
        isValid: true,
        message: ""
    };

}

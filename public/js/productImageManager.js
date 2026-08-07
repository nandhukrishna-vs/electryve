class ProductImageManager {
    constructor() {
        this.cropper = null;
        this.cropModal = null;
        this.cropImage = null;
        this.cropSaveBtn = null;
        this.currentInput = null;
        this.currentVariantCard = null;
        this.selectedFiles = [];
        this.currentFiles = [];
        this.currentIndex = 0;

        // Replacement fields
        this.replaceType = null; // 'existing' or 'new'
        this.replaceIndex = null;
        this.replaceCol = null;
        this.oldImageUrl = null;
        this.replaceImgElement = null;
        this.selectedReplaceFile = null;
    }

    init() {
        this.cropModal = new bootstrap.Modal(
            document.getElementById("cropModal")
        );
        this.cropImage = document.getElementById("cropImage");
        this.cropSaveBtn = document.getElementById("cropSaveBtn");
        this.bindEvents();
    }

    bindEvents() {
        const modal = document.getElementById("cropModal");
        modal.addEventListener(
            "hidden.bs.modal",
            () => this.destroyCropper()
        );
        this.cropSaveBtn.addEventListener(
            "click",
            () => this.saveCurrentImage()
        );
    }

    revokeCurrentFiles() {
        if (this.currentFiles && this.currentFiles.length > 0) {
            this.currentFiles.forEach(image => {
                if (image.url && image.url.startsWith("blob:")) {
                    URL.revokeObjectURL(image.url);
                }
            });
        }
        this.currentFiles = [];
    }

    selectImages(event) {
        this.currentInput = event.target;
        this.currentVariantCard = this.currentInput.closest(".variant-card");
        this.selectedFiles = [...event.target.files];
        
        // Prevent memory leak by revoking previously created preview URLs
        this.revokeCurrentFiles();
        
        this.currentIndex = 0;
        if (!this.selectedFiles.length) {
            return;
        }
        this.openCropper();
    }

    openCropper() {
        const file = this.selectedFiles[this.currentIndex];
        this.openCropperForFile(file);
    }

    openCropperForFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            this.cropImage.src = event.target.result;
            this.cropImage.onload = () => {
                this.cropModal.show();
                setTimeout(() => {
                    this.initCropper();
                }, 100);
            };
        };
        reader.readAsDataURL(file);
    }

    initCropper() {
        this.cropper = new Cropper(
            this.cropImage,
            {
                aspectRatio: 1,
                viewMode: 1,
                autoCropArea: 0.8,
                responsive: true,
                movable: true,
                zoomable: true,
                scalable: true
            }
        );
    }

    destroyCropper() {
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
    }

    async saveCurrentImage() {
        if (!this.cropper) {
            return;
        }

        const canvas = this.cropper.getCroppedCanvas({
            width: 800,
            height: 800
        });

        const blob = await new Promise(resolve =>
            canvas.toBlob(
                resolve,
                "image/webp",
                0.9
            )
        );

        const filename = this.replaceType
            ? (this.selectedReplaceFile ? this.selectedReplaceFile.name : "replaced_image.webp")
            : (this.selectedFiles[this.currentIndex] ? this.selectedFiles[this.currentIndex].name : "image.webp");

        const croppedFile = new File(
            [blob],
            filename,
            {
                type: "image/webp"
            }
        );

        if (this.replaceType) {
            await this.saveReplacementImage(croppedFile);
            return;
        }

        this.currentFiles.push({
            file: croppedFile,
            url: URL.createObjectURL(croppedFile)
        });

        this.destroyCropper();

        if (this.currentIndex < this.selectedFiles.length - 1) {
            this.currentIndex++;
            this.openCropper();
            return;
        }

        this.rebuildInput();
        this.renderPreview();
        this.cropModal.hide();
    }

    rebuildInput() {
        const dataTransfer = new DataTransfer();
        this.currentFiles.forEach(image => {
            dataTransfer.items.add(image.file);
        });
        this.currentInput.files = dataTransfer.files;
    }

    syncCurrentFiles(variantCard) {
        this.currentVariantCard = variantCard;
        this.currentInput = variantCard.querySelector(".variantImages");

        // Revoke old object URLs first
        this.revokeCurrentFiles();

        if (this.currentInput && this.currentInput.files) {
            this.currentFiles = Array.from(this.currentInput.files).map(file => ({
                file: file,
                url: URL.createObjectURL(file)
            }));
        }
    }

    renderPreview() {
        if (!this.currentVariantCard) return;

        const previewContainer = this.currentVariantCard.querySelector(".newImagePreviewContainer");
        previewContainer.innerHTML = "";

        this.currentFiles.forEach((image, index) => {
            const col = document.createElement("div");
            col.className = "col-md-3 mb-3";
            col.innerHTML = `
                <div class="card shadow-sm position-relative">
                    <img
                        src="${image.url}"
                        class="card-img-top"
                        style="height:180px;object-fit:cover;">
                    <div class="position-absolute top-0 end-0 d-flex flex-column gap-1 m-2">
                        <button
                            type="button"
                            class="btn btn-primary btn-sm replaceNewImage">
                            <i class="bi bi-arrow-repeat"></i>
                        </button>
                        <button
                            type="button"
                            class="btn btn-danger btn-sm removeImage">
                            <i class="bi bi-x"></i>
                        </button>
                    </div>
                </div>
            `;

            col.querySelector(".removeImage").onclick = () => {
                this.removeImage(this.currentVariantCard, index);
            };

            col.querySelector(".replaceNewImage").onclick = () => {
                const imgElement = col.querySelector("img");
                this.startReplace('new', this.currentVariantCard, index, image.url, imgElement);
            };

            previewContainer.appendChild(col);
        });
    }

    removeImage(variantCard, index) {
        this.syncCurrentFiles(variantCard);
        
        // Revoke the specific image's preview URL
        const image = this.currentFiles[index];
        if (image && image.url && image.url.startsWith("blob:")) {
            URL.revokeObjectURL(image.url);
        }

        this.currentFiles.splice(index, 1);
        this.rebuildInput();
        this.renderPreview();
    }

    startReplace(type, variantCard, elementOrIndex, value, imgElement) {
        this.replaceType = type;
        this.currentVariantCard = variantCard;
        this.currentInput = variantCard.querySelector(".variantImages");
        this.replaceImgElement = imgElement;

        if (type === 'existing') {
            this.replaceCol = elementOrIndex; // The col element
            this.oldImageUrl = value;
        } else if (type === 'new') {
            this.replaceIndex = elementOrIndex; // The index in currentFiles
            this.syncCurrentFiles(variantCard);
        }

        let replaceFileInput = document.getElementById("replaceImageFileInput");
        if (!replaceFileInput) {
            replaceFileInput = document.createElement("input");
            replaceFileInput.type = "file";
            replaceFileInput.id = "replaceImageFileInput";
            replaceFileInput.accept = "image/*";
            replaceFileInput.style.display = "none";
            document.body.appendChild(replaceFileInput);

            replaceFileInput.addEventListener("change", (e) => {
                const files = [...e.target.files];
                if (files.length > 0) {
                    this.selectedReplaceFile = files[0];
                    this.openCropperForFile(files[0]);
                }
            });
        }
        replaceFileInput.value = "";
        replaceFileInput.click();
    }

    async saveReplacementImage(croppedFile) {
        if (this.replaceType === 'existing') {
            // Find or create the replace file input inside this.replaceCol
            let replaceInput = this.replaceCol.querySelector(".replace-image-file-input");
            if (!replaceInput) {
                replaceInput = document.createElement("input");
                replaceInput.type = "file";
                replaceInput.className = "replace-image-file-input";
                replaceInput.style.display = "none";
                this.replaceCol.appendChild(replaceInput);
            }

            const dataTransfer = new DataTransfer();
            dataTransfer.items.add(croppedFile);
            replaceInput.files = dataTransfer.files;

            // Find or create the hidden target URL field inside this.replaceCol
            let replaceTargetInput = this.replaceCol.querySelector(".replace-target-input");
            if (!replaceTargetInput) {
                replaceTargetInput = document.createElement("input");
                replaceTargetInput.type = "hidden";
                replaceTargetInput.className = "replace-target-input";
                this.replaceCol.appendChild(replaceTargetInput);
            }
            replaceTargetInput.value = this.oldImageUrl;

            // Revoke the old preview URL if it was already a blob URL
            if (this.replaceImgElement.src.startsWith("blob:")) {
                URL.revokeObjectURL(this.replaceImgElement.src);
            }

            this.replaceImgElement.src = URL.createObjectURL(croppedFile);

            this.replaceType = null;
            this.replaceCol = null;
            this.oldImageUrl = null;
            this.replaceImgElement = null;

            if (typeof updateVariants === 'function') {
                updateVariants();
            }
        } else if (this.replaceType === 'new') {
            // Revoke the old preview URL of the new image being replaced
            const oldImage = this.currentFiles[this.replaceIndex];
            if (oldImage && oldImage.url && oldImage.url.startsWith("blob:")) {
                URL.revokeObjectURL(oldImage.url);
            }

            this.currentFiles[this.replaceIndex] = {
                file: croppedFile,
                url: URL.createObjectURL(croppedFile)
            };

            this.rebuildInput();
            this.renderPreview();

            this.replaceType = null;
            this.replaceIndex = null;
            this.replaceImgElement = null;
        }

        this.destroyCropper();
        this.cropModal.hide();
    }
}

const ImageManager = new ProductImageManager();

document.addEventListener(
    "DOMContentLoaded",
    () => ImageManager.init()
);
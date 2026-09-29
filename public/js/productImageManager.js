/**
 * Electryve Product Image Manager
 * Handles multi-image selection, independent cropping, replacement,
 * deletion, and per-variant state isolation using CropperJS v1.6.2.
 * Supports both new uploads and existing S3 images via same-origin blob pipeline.
 */

class ProductImageManager {
    constructor() {
        this.cropper = null;
        this.cropModalEl = null;
        this.cropModal = null;
        this.cropImage = null;
        this.cropSaveBtn = null;
        this.cropSkipBtn = null;
        this.cropCancelBtn = null;
        this.cropResetBtn = null;
        this.cropZoomInBtn = null;
        this.cropZoomOutBtn = null;
        this.cropRotateLeftBtn = null;
        this.cropRotateRightBtn = null;
        this.cropFlipHBtn = null;
        this.cropFlipVBtn = null;
        this.cropAspect11Btn = null;
        this.cropAspectFreeBtn = null;
        this.cropBatchIndicator = null;
        this.cropModalTitle = null;
        this.cropImageInfo = null;

        // Active crop context
        this.activeItem = null;
        this.activeCard = null;
        this.activeSourceType = null; // 'NEW' or 'EXISTING'
        this.tempBlobUrl = null;
        this.batchQueue = [];
        this.batchIndex = 1;
        this.batchTotal = 1;
        this.scaleX = 1;
        this.scaleY = 1;

        // Hidden input for single-file replacements
        this.replaceFileInput = null;
        this.replaceCallback = null;

        // Per-variant state map: variantId -> { newImages: [], existingImages: [] }
        this.variantStates = new Map();

        // Constants
        this.ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];
        this.ALLOWED_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".jfif"];
        this.MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
        this.MIN_IMAGES = 3;
        this.MAX_IMAGES = 5;
    }

    init() {
        this.cropModalEl = document.getElementById("cropModal");
        if (!this.cropModalEl) return;

        // Ensure modal is direct child of document.body so it is never trapped in nested stacking contexts
        if (this.cropModalEl.parentElement !== document.body) {
            document.body.appendChild(this.cropModalEl);
        }

        if (!this.cropModal && typeof bootstrap !== "undefined" && bootstrap.Modal) {
            this.cropModal = new bootstrap.Modal(this.cropModalEl, {
                backdrop: "static",
                keyboard: false
            });
        }

        this.cropImage = document.getElementById("cropImage");
        this.cropSaveBtn = document.getElementById("cropSaveBtn");
        this.cropSkipBtn = document.getElementById("cropSkipBtn");
        this.cropCancelBtn = document.getElementById("cropCancelBtn");
        this.cropResetBtn = document.getElementById("cropResetBtn");
        this.cropZoomInBtn = document.getElementById("cropZoomInBtn");
        this.cropZoomOutBtn = document.getElementById("cropZoomOutBtn");
        this.cropRotateLeftBtn = document.getElementById("cropRotateLeftBtn");
        this.cropRotateRightBtn = document.getElementById("cropRotateRightBtn");
        this.cropFlipHBtn = document.getElementById("cropFlipHBtn");
        this.cropFlipVBtn = document.getElementById("cropFlipVBtn");
        this.cropAspect11Btn = document.getElementById("cropAspect11Btn");
        this.cropAspectFreeBtn = document.getElementById("cropAspectFreeBtn");
        this.cropBatchIndicator = document.getElementById("cropBatchIndicator");
        this.cropModalTitle = document.getElementById("cropModalTitle");
        this.cropImageInfo = document.getElementById("cropImageInfo");

        this.bindModalEvents();
        this.initReplaceFileInput();
    }

    initReplaceFileInput() {
        if (!this.replaceFileInput) {
            this.replaceFileInput = document.createElement("input");
            this.replaceFileInput.type = "file";
            this.replaceFileInput.accept = "image/jpeg,image/png,image/webp";
            this.replaceFileInput.style.display = "none";
            this.replaceFileInput.id = "productImageReplaceInput";
            document.body.appendChild(this.replaceFileInput);

            this.replaceFileInput.addEventListener("change", (e) => {
                const files = Array.from(e.target.files);
                e.target.value = ""; // Always reset immediately
                if (files.length > 0 && typeof this.replaceCallback === "function") {
                    const file = files[0];
                    if (!this.validateFile(file)) return;
                    this.replaceCallback(file);
                }
            });
        }
    }

    triggerReplacePicker(callback) {
        this.initReplaceFileInput();
        this.replaceCallback = callback;
        if (this.replaceFileInput) {
            this.replaceFileInput.value = "";
            this.replaceFileInput.click();
        }
    }

    bindModalEvents() {
        if (!this.cropModalEl) return;

        this.cropModalEl.addEventListener("hidden.bs.modal", () => {
            this.destroyCropper();
            if (this.tempBlobUrl) {
                URL.revokeObjectURL(this.tempBlobUrl);
                this.tempBlobUrl = null;
            }
            this.activeItem = null;
            this.activeCard = null;
            this.batchQueue = [];
        });

        if (this.cropSaveBtn && !this.cropSaveBtn._bound) {
            this.cropSaveBtn._bound = true;
            this.cropSaveBtn.addEventListener("click", () => this.applyCrop());
        }

        if (this.cropSkipBtn && !this.cropSkipBtn._bound) {
            this.cropSkipBtn._bound = true;
            this.cropSkipBtn.addEventListener("click", () => this.skipCurrentImage());
        }

        if (this.cropCancelBtn && !this.cropCancelBtn._bound) {
            this.cropCancelBtn._bound = true;
            this.cropCancelBtn.addEventListener("click", () => {
                this.batchQueue = [];
                this.destroyCropper();
            });
        }

        const closeBtn = document.getElementById("cropModalCloseBtn");
        if (closeBtn && !closeBtn._bound) {
            closeBtn._bound = true;
            closeBtn.addEventListener("click", () => {
                this.batchQueue = [];
                this.destroyCropper();
            });
        }

        // Toolbar Controls
        if (this.cropZoomInBtn && !this.cropZoomInBtn._bound) {
            this.cropZoomInBtn._bound = true;
            this.cropZoomInBtn.addEventListener("click", () => {
                if (this.cropper) this.cropper.zoom(0.1);
            });
        }

        if (this.cropZoomOutBtn && !this.cropZoomOutBtn._bound) {
            this.cropZoomOutBtn._bound = true;
            this.cropZoomOutBtn.addEventListener("click", () => {
                if (this.cropper) this.cropper.zoom(-0.1);
            });
        }

        if (this.cropRotateLeftBtn && !this.cropRotateLeftBtn._bound) {
            this.cropRotateLeftBtn._bound = true;
            this.cropRotateLeftBtn.addEventListener("click", () => {
                if (this.cropper) this.cropper.rotate(-90);
            });
        }

        if (this.cropRotateRightBtn && !this.cropRotateRightBtn._bound) {
            this.cropRotateRightBtn._bound = true;
            this.cropRotateRightBtn.addEventListener("click", () => {
                if (this.cropper) this.cropper.rotate(90);
            });
        }

        if (this.cropFlipHBtn && !this.cropFlipHBtn._bound) {
            this.cropFlipHBtn._bound = true;
            this.cropFlipHBtn.addEventListener("click", () => {
                if (this.cropper) {
                    this.scaleX = (this.scaleX || 1) * -1;
                    this.cropper.scaleX(this.scaleX);
                }
            });
        }

        if (this.cropFlipVBtn && !this.cropFlipVBtn._bound) {
            this.cropFlipVBtn._bound = true;
            this.cropFlipVBtn.addEventListener("click", () => {
                if (this.cropper) {
                    this.scaleY = (this.scaleY || 1) * -1;
                    this.cropper.scaleY(this.scaleY);
                }
            });
        }

        if (this.cropAspect11Btn && !this.cropAspect11Btn._bound) {
            this.cropAspect11Btn._bound = true;
            this.cropAspect11Btn.addEventListener("click", () => {
                if (this.cropper) {
                    this.cropper.setAspectRatio(1);
                    this.cropAspect11Btn.classList.add("btn-dark", "active");
                    this.cropAspect11Btn.classList.remove("btn-outline-secondary");
                    if (this.cropAspectFreeBtn) {
                        this.cropAspectFreeBtn.classList.remove("btn-dark", "active");
                        this.cropAspectFreeBtn.classList.add("btn-outline-secondary");
                    }
                }
            });
        }

        if (this.cropAspectFreeBtn && !this.cropAspectFreeBtn._bound) {
            this.cropAspectFreeBtn._bound = true;
            this.cropAspectFreeBtn.addEventListener("click", () => {
                if (this.cropper) {
                    this.cropper.setAspectRatio(NaN);
                    this.cropAspectFreeBtn.classList.add("btn-dark", "active");
                    this.cropAspectFreeBtn.classList.remove("btn-outline-secondary");
                    if (this.cropAspect11Btn) {
                        this.cropAspect11Btn.classList.remove("btn-dark", "active");
                        this.cropAspect11Btn.classList.add("btn-outline-secondary");
                    }
                }
            });
        }

        if (this.cropResetBtn && !this.cropResetBtn._bound) {
            this.cropResetBtn._bound = true;
            this.cropResetBtn.addEventListener("click", () => {
                if (this.cropper) {
                    this.scaleX = 1;
                    this.scaleY = 1;
                    this.cropper.reset();
                    if (this.cropAspect11Btn) {
                        this.cropAspect11Btn.click();
                    }
                }
            });
        }
    }

    /**
     * File validation for type & size
     */
    validateFile(file) {
        if (!file) return false;

        const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
        const hasValidExt = this.ALLOWED_EXTS.includes(ext);
        const hasValidMime = this.ALLOWED_TYPES.includes(file.type);

        if (!hasValidExt && !hasValidMime) {
            if (window.showError) {
                window.showError(`"${file.name}" is not a valid format. Only JPG, PNG, and WebP are allowed.`);
            } else {
                alert(`"${file.name}" is not a valid format. Only JPG, PNG, and WebP are allowed.`);
            }
            return false;
        }

        if (file.size > this.MAX_FILE_SIZE) {
            if (window.showError) {
                window.showError(`"${file.name}" exceeds the 2 MB limit.`);
            } else {
                alert(`"${file.name}" exceeds the 2 MB limit.`);
            }
            return false;
        }

        return true;
    }

    /**
     * Variant State Initialization
     */
    ensureVariantId(card) {
        if (!card.dataset.variantId) {
            card.dataset.variantId = `var_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        }
        return card.dataset.variantId;
    }

    getVariantState(card) {
        const vId = this.ensureVariantId(card);
        if (!this.variantStates.has(vId)) {
            this.variantStates.set(vId, {
                newImages: [],
                existingImages: []
            });
        }
        return this.variantStates.get(vId);
    }

    initVariant(card, initialExistingUrls = []) {
        const state = this.getVariantState(card);
        state.existingImages = (initialExistingUrls || []).map((url, idx) => ({
            id: `ex_${Date.now()}_${idx}_${Math.random().toString(36).substr(2, 5)}`,
            url: url,
            isReplaced: false,
            replacementFile: null,
            replacementBlobUrl: null,
            isRemoved: false
        }));
        state.newImages = [];

        this.renderPreviews(card);
    }

    destroyVariant(card) {
        const vId = card.dataset.variantId;
        if (!vId) return;

        const state = this.variantStates.get(vId);
        if (state) {
            state.newImages.forEach(img => {
                if (img.blobUrl && img.blobUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(img.blobUrl);
                }
            });
            state.existingImages.forEach(img => {
                if (img.replacementBlobUrl && img.replacementBlobUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(img.replacementBlobUrl);
                }
            });
            this.variantStates.delete(vId);
        }
    }

    getVariantImageCount(card) {
        const state = this.getVariantState(card);
        const existingCount = state.existingImages.filter(x => !x.isRemoved).length;
        const newCount = state.newImages.length;
        return existingCount + newCount;
    }

    getVariantFiles(card) {
        const state = this.getVariantState(card);
        const files = state.newImages.map(x => x.file);
        state.existingImages.forEach(ex => {
            if (ex.isReplaced && ex.replacementFile && !ex.isRemoved) {
                files.push(ex.replacementFile);
            }
        });
        return files;
    }

    /**
     * File selection handler on input.variantImages
     */
    handleFileSelect(event, card) {
        const input = event.target;
        const files = Array.from(input.files || []);

        // ALWAYS immediately reset input value so re-selecting the identical file triggers 'change'
        input.value = "";

        if (!files.length) return;

        const state = this.getVariantState(card);
        const currentCount = state.existingImages.filter(x => !x.isRemoved).length + state.newImages.length;

        if (currentCount >= this.MAX_IMAGES) {
            if (window.showWarning) {
                window.showWarning(`Variant already has ${this.MAX_IMAGES} images (maximum limit).`);
            }
            return;
        }

        const validFiles = [];
        for (const file of files) {
            if (!this.validateFile(file)) continue;

            if (currentCount + validFiles.length >= this.MAX_IMAGES) {
                if (window.showWarning) {
                    window.showWarning(`Maximum ${this.MAX_IMAGES} images allowed per variant. Some files were not added.`);
                }
                break;
            }
            validFiles.push(file);
        }

        if (!validFiles.length) return;

        const newlyAdded = [];
        validFiles.forEach(file => {
            const item = {
                id: `new_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
                file: file,
                originalFile: file,
                blobUrl: URL.createObjectURL(file),
                isCropped: false
            };
            state.newImages.push(item);
            newlyAdded.push(item);
        });

        // Sync inputs and refresh preview
        this.syncVariantInput(card);
        this.renderPreviews(card);
        if (typeof updateVariants === "function") {
            updateVariants();
        }

        // Open cropper for the first newly added item
        if (newlyAdded.length > 0) {
            this.batchQueue = newlyAdded.slice(1);
            this.batchIndex = 1;
            this.batchTotal = newlyAdded.length;
            this.openCropperForItem(newlyAdded[0], card, "NEW", newlyAdded.length > 1);
        }
    }

    // Backwards-compatible method call
    selectImages(event, optCard) {
        const card = optCard || event.target.closest(".variant-card");
        if (card) {
            this.handleFileSelect(event, card);
        }
    }

    /**
     * Resolves a remote or local image URL into a safe, same-origin Blob URL.
     * Prevents browser cross-origin canvas tainting and caching discrepancies.
     */
    async getSafeBlobUrl(url) {
        if (!url) return "";
        if (url.startsWith("blob:") || url.startsWith("data:")) {
            return url;
        }

        // 1. Attempt direct fetch with CORS (S3 CORS is active).
        // cache: 'reload' ensures the browser does not reuse an earlier non-CORS response cached by <img>.
        try {
            const res = await fetch(url, { mode: "cors", cache: "reload" });
            if (res.ok) {
                const blob = await res.blob();
                if (blob && blob.size > 0 && (blob.type.startsWith("image/") || blob.type === "application/octet-stream")) {
                    return URL.createObjectURL(blob);
                }
            }
        } catch (directErr) {
            console.warn("Direct CORS fetch to storage failed, falling back to same-origin proxy:", directErr.message);
        }

        // 2. Fallback to authenticated same-origin admin proxy endpoint
        try {
            const proxyUrl = `/admin/products/image-proxy?url=${encodeURIComponent(url)}`;
            const res = await fetch(proxyUrl, { credentials: "same-origin" });
            if (res.ok && !res.redirected) {
                const blob = await res.blob();
                if (blob && blob.size > 0 && (blob.type.startsWith("image/") || blob.type === "application/octet-stream")) {
                    return URL.createObjectURL(blob);
                }
            }
        } catch (proxyErr) {
            console.error("Same-origin image proxy fetch failed:", proxyErr);
        }

        // 3. Final fallback
        return url;
    }

    /**
     * Waits for both Bootstrap modal shown event and image load with natural dimensions > 0.
     */
    async waitForModalAndImage(safeSrc) {
        // Step 1: Ensure modal is shown and transition completed
        if (!this.isModalShown) {
            await new Promise((resolve) => {
                const onShown = () => {
                    this.cropModalEl.removeEventListener("shown.bs.modal", onShown);
                    this.isModalShown = true;
                    resolve();
                };
                this.cropModalEl.addEventListener("shown.bs.modal", onShown);
            });
        }

        // Step 2: Clear old source and load fresh image safely
        await new Promise((resolve, reject) => {
            const img = this.cropImage;

            if (img._onLoad) img.removeEventListener("load", img._onLoad);
            if (img._onError) img.removeEventListener("error", img._onError);

            const onLoad = () => {
                img.removeEventListener("load", onLoad);
                img.removeEventListener("error", onError);
                img._onLoad = null;
                img._onError = null;
                if (img.naturalWidth > 0 && img.naturalHeight > 0) {
                    resolve();
                } else {
                    reject(new Error("Image loaded with zero natural dimensions."));
                }
            };

            const onError = (e) => {
                img.removeEventListener("load", onLoad);
                img.removeEventListener("error", onError);
                img._onLoad = null;
                img._onError = null;
                reject(new Error("Failed to load image in crop workspace."));
            };

            img._onLoad = onLoad;
            img._onError = onError;
            img.addEventListener("load", onLoad);
            img.addEventListener("error", onError);

            img.crossOrigin = "anonymous";
            img.src = safeSrc;
        });

        // Step 3: Ensure container has computed non-zero dimensions
        const container = this.cropModalEl.querySelector(".crop-workspace-container");
        if (container && (container.clientWidth === 0 || container.clientHeight === 0)) {
            await new Promise((r) => requestAnimationFrame(r));
        }
    }

    /**
     * Cropper Lifecycle
     */
    async openCropperForItem(item, card, sourceType, isBatch = false) {
        if (!this.cropModal) {
            this.init();
        }

        this.destroyCropper();

        // Revoke any temporary blob created in previous session
        if (this.tempBlobUrl) {
            URL.revokeObjectURL(this.tempBlobUrl);
            this.tempBlobUrl = null;
        }

        // Clear previous source to prevent stale rendering
        if (this.cropImage) {
            this.cropImage.removeAttribute("src");
            this.cropImage.removeAttribute("crossorigin");
        }

        this.activeItem = item;
        this.activeCard = card;
        this.activeSourceType = sourceType;

        const cardIndex = Array.from(document.querySelectorAll(".variant-card")).indexOf(card) + 1;
        const variantLabel = cardIndex > 0 ? `Variant ${cardIndex}` : "Variant";

        if (this.cropModalTitle) {
            this.cropModalTitle.textContent = `Crop Image — ${variantLabel}`;
        }

        if (this.cropImageInfo) {
            const fileName = item.file?.name || (sourceType === "EXISTING" ? "Existing Product Image" : "Product Photo");
            this.cropImageInfo.textContent = `${fileName} • 1:1 Recommended`;
        }

        if (isBatch && this.batchTotal > 1) {
            if (this.cropBatchIndicator) {
                this.cropBatchIndicator.textContent = `Image ${this.batchIndex} of ${this.batchTotal}`;
                this.cropBatchIndicator.style.display = "inline-block";
            }
            if (this.cropSkipBtn) {
                this.cropSkipBtn.style.display = "inline-block";
            }
        } else {
            if (this.cropBatchIndicator) {
                this.cropBatchIndicator.style.display = "none";
            }
            if (this.cropSkipBtn) {
                this.cropSkipBtn.style.display = "none";
            }
        }

        // Show modal dialog if not already open
        if (!this.isModalShown && !this.cropModalEl.classList.contains("show")) {
            this.cropModal.show();
        }

        // Resolve safe same-origin blob source for Cropper pipeline
        const rawSrc = item.replacementBlobUrl || item.blobUrl || item.url;
        const safeSrc = await this.getSafeBlobUrl(rawSrc);

        if (safeSrc !== rawSrc && safeSrc.startsWith("blob:")) {
            this.tempBlobUrl = safeSrc;
        }

        try {
            // Await modal visibility AND image load
            await this.waitForModalAndImage(safeSrc);
            this.initCropper();
        } catch (err) {
            console.error("Failed to initialize crop workspace:", err);
            if (window.showError) {
                window.showError("Unable to load image for cropping. Please try again.");
            }
        }
    }

    initCropper() {
        this.destroyCropper();

        this.scaleX = 1;
        this.scaleY = 1;

        if (this.cropAspect11Btn) {
            this.cropAspect11Btn.classList.add("btn-dark", "active");
            this.cropAspect11Btn.classList.remove("btn-outline-secondary");
        }
        if (this.cropAspectFreeBtn) {
            this.cropAspectFreeBtn.classList.remove("btn-dark", "active");
            this.cropAspectFreeBtn.classList.add("btn-outline-secondary");
        }

        if (typeof Cropper === "undefined") {
            console.error("CropperJS library is not loaded.");
            return;
        }

        this.cropper = new Cropper(this.cropImage, {
            aspectRatio: 1,
            viewMode: 1,
            autoCropArea: 0.88,
            responsive: true,
            restore: false,
            guides: true,
            center: true,
            highlight: false,
            cropBoxMovable: true,
            cropBoxResizable: true,
            toggleDragModeOnDblclick: false,
            minCropBoxWidth: 50,
            minCropBoxHeight: 50
        });
        window.__debugCropper = this.cropper;

        if (window.ResizeObserver && !this._containerResizeObserver && this.cropModalEl) {
            const container = this.cropModalEl.querySelector(".crop-workspace-container");
            if (container) {
                this._containerResizeObserver = new ResizeObserver(() => {
                    if (this.cropper) {
                        this.cropper.resize();
                    }
                });
                this._containerResizeObserver.observe(container);
            }
        }
    }

    destroyCropper() {
        if (this._containerResizeObserver) {
            this._containerResizeObserver.disconnect();
            this._containerResizeObserver = null;
        }
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        window.__debugCropper = null;
    }

    async skipCurrentImage() {
        if (this.batchQueue && this.batchQueue.length > 0) {
            const nextItem = this.batchQueue.shift();
            this.batchIndex++;
            await this.openCropperForItem(nextItem, this.activeCard, "NEW", true);
        } else {
            this.destroyCropper();
            if (this.cropModal) this.cropModal.hide();
        }
    }

    async applyCrop() {
        if (!this.cropper || !this.activeItem || !this.activeCard) {
            return;
        }

        try {
            const canvas = this.cropper.getCroppedCanvas({
                width: 800,
                height: 800,
                imageSmoothingEnabled: true,
                imageSmoothingQuality: "high"
            });

            if (!canvas) {
                if (window.showError) window.showError("Unable to crop this image. Please try again.");
                return;
            }

            let blob = await new Promise((resolve) => {
                canvas.toBlob(resolve, "image/webp", 0.9);
            });

            // Fallback for browsers or tainted canvas edge-cases where toBlob returns null
            if (!blob) {
                try {
                    const dataUrl = canvas.toDataURL("image/webp", 0.9);
                    if (dataUrl && dataUrl.startsWith("data:image/")) {
                        const res = await fetch(dataUrl);
                        blob = await res.blob();
                    }
                } catch (dataUrlErr) {
                    console.warn("toDataURL fallback failed:", dataUrlErr);
                }
            }

            if (!blob || blob.size === 0) {
                if (window.showError) window.showError("Unable to process this image. Please try again.");
                return;
            }

            const baseName = (this.activeItem.file?.name || (this.activeSourceType === "EXISTING" ? "existing_image" : "product_image")).replace(/\.[^/.]+$/, "");
            const croppedFileName = `${baseName}_cropped.webp`;
            const croppedFile = new File([blob], croppedFileName, { type: "image/webp" });

            if (this.activeSourceType === "EXISTING") {
                if (this.activeItem.replacementBlobUrl && this.activeItem.replacementBlobUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(this.activeItem.replacementBlobUrl);
                }
                this.activeItem.isReplaced = true;
                this.activeItem.replacementFile = croppedFile;
                this.activeItem.replacementBlobUrl = URL.createObjectURL(croppedFile);
            } else {
                if (this.activeItem.blobUrl && this.activeItem.blobUrl.startsWith("blob:")) {
                    URL.revokeObjectURL(this.activeItem.blobUrl);
                }
                this.activeItem.file = croppedFile;
                this.activeItem.blobUrl = URL.createObjectURL(croppedFile);
                this.activeItem.isCropped = true;
            }

            // Clean up temporary fetch blob if present
            if (this.tempBlobUrl) {
                URL.revokeObjectURL(this.tempBlobUrl);
                this.tempBlobUrl = null;
            }

            this.syncVariantInput(this.activeCard);
            this.renderPreviews(this.activeCard);
            if (typeof updateVariants === "function") {
                updateVariants();
            }

            // Batch progression
            if (this.batchQueue && this.batchQueue.length > 0) {
                const nextItem = this.batchQueue.shift();
                this.batchIndex++;
                await this.openCropperForItem(nextItem, this.activeCard, "NEW", true);
            } else {
                this.destroyCropper();
                if (this.cropModal) this.cropModal.hide();
                if (window.showSuccess) {
                    window.showSuccess("Image crop saved successfully!");
                }
            }
        } catch (error) {
            console.error("Crop application error:", error);
            if (window.showError) {
                window.showError("Unable to crop this image. Please try again.");
            }
        }
    }

    /**
     * Actions: Replace & Remove
     */
    startReplaceNew(card, item) {
        this.triggerReplacePicker(async (file) => {
            if (item.blobUrl && item.blobUrl.startsWith("blob:")) {
                URL.revokeObjectURL(item.blobUrl);
            }
            item.file = file;
            item.originalFile = file;
            item.blobUrl = URL.createObjectURL(file);
            item.isCropped = false;

            this.syncVariantInput(card);
            this.renderPreviews(card);
            if (typeof updateVariants === "function") updateVariants();

            // Open cropper for replacement
            this.batchQueue = [];
            await this.openCropperForItem(item, card, "NEW", false);
        });
    }

    startReplaceExisting(card, item) {
        this.triggerReplacePicker(async (file) => {
            if (item.replacementBlobUrl && item.replacementBlobUrl.startsWith("blob:")) {
                URL.revokeObjectURL(item.replacementBlobUrl);
            }
            item.isReplaced = true;
            item.replacementFile = file;
            item.replacementBlobUrl = URL.createObjectURL(file);

            this.syncVariantInput(card);
            this.renderPreviews(card);
            if (typeof updateVariants === "function") updateVariants();

            // Open cropper for replacement
            this.batchQueue = [];
            await this.openCropperForItem(item, card, "EXISTING", false);
        });
    }

    removeNewImage(card, item) {
        const state = this.getVariantState(card);
        const index = state.newImages.findIndex(x => x.id === item.id);
        if (index !== -1) {
            if (item.blobUrl && item.blobUrl.startsWith("blob:")) {
                URL.revokeObjectURL(item.blobUrl);
            }
            state.newImages.splice(index, 1);
            this.syncVariantInput(card);
            this.renderPreviews(card);
            if (typeof updateVariants === "function") updateVariants();
        }
    }

    removeExistingImage(card, item) {
        if (item.replacementBlobUrl && item.replacementBlobUrl.startsWith("blob:")) {
            URL.revokeObjectURL(item.replacementBlobUrl);
            item.replacementBlobUrl = null;
        }
        item.isRemoved = true;
        this.syncVariantInput(card);
        this.renderPreviews(card);
        if (typeof updateVariants === "function") updateVariants();
    }

    /**
     * Data Transfer & Input Sync
     */
    syncVariantInput(card) {
        const state = this.getVariantState(card);
        const fileInput = card.querySelector(".variantImages");
        if (!fileInput) return;

        const dt = new DataTransfer();
        state.newImages.forEach(img => {
            if (img.file) {
                dt.items.add(img.file);
            }
        });
        fileInput.files = dt.files;
    }

    syncVariantIndex(card, variantIndex) {
        const state = this.getVariantState(card);

        // Update main file input name
        const fileInput = card.querySelector(".variantImages");
        if (fileInput) {
            fileInput.name = `variantImages_${variantIndex}`;
        }

        // Update existing & replacement hidden inputs
        const existingContainer = card.querySelector(".existingImageContainer");
        if (!existingContainer) return;

        const visibleExisting = state.existingImages.filter(x => !x.isRemoved);
        const cols = existingContainer.querySelectorAll(".existing-image-col");

        cols.forEach((col, imgIdx) => {
            const item = visibleExisting[imgIdx];
            if (!item) return;

            const existingInput = col.querySelector(".existing-url-input");
            if (existingInput) {
                existingInput.name = `variants[${variantIndex}][existingImages][]`;
                existingInput.value = item.url;
            }

            const targetInput = col.querySelector(".replace-target-input");
            if (targetInput) {
                targetInput.value = item.isReplaced ? item.url : "";
                if (item.isReplaced) {
                    targetInput.name = `replaceTarget_${variantIndex}_${imgIdx}`;
                } else {
                    targetInput.removeAttribute("name");
                }
            }

            const replaceFileInput = col.querySelector(".replace-image-file-input");
            if (replaceFileInput) {
                if (item.isReplaced && item.replacementFile) {
                    replaceFileInput.name = `replaceImage_${variantIndex}_${imgIdx}`;
                    const dt = new DataTransfer();
                    dt.items.add(item.replacementFile);
                    replaceFileInput.files = dt.files;
                } else {
                    replaceFileInput.removeAttribute("name");
                    replaceFileInput.value = "";
                }
            }
        });
    }

    /**
     * Rendering Preview Grids
     */
    renderPreviews(card) {
        const state = this.getVariantState(card);

        // 1. Render Existing Images (Edit page)
        const existingContainer = card.querySelector(".existingImageContainer");
        if (existingContainer) {
            existingContainer.innerHTML = "";
            const visibleExisting = state.existingImages.filter(x => !x.isRemoved);
            const parentCol = existingContainer.closest(".col-12");
            if (parentCol) {
                parentCol.style.display = visibleExisting.length > 0 ? "" : "none";
            }

            visibleExisting.forEach((item, idx) => {
                const col = document.createElement("div");
                col.className = "col-6 col-sm-4 col-md-3 mb-3 existing-image-col";

                const displaySrc = item.replacementBlobUrl || item.url;
                const badgeHtml = item.isReplaced
                    ? `<span class="image-status-badge badge bg-info text-white shadow-sm"><i class="bi bi-arrow-repeat me-1"></i>Replaced</span>`
                    : `<span class="image-status-badge badge bg-dark text-white shadow-sm opacity-75">Existing</span>`;

                col.innerHTML = `
                    <div class="card h-100 image-preview-card">
                        <img src="${displaySrc}" class="image-preview-thumb" alt="Product variant image">
                        ${badgeHtml}
                        <div class="image-action-overlay">
                            <button type="button" class="btn btn-sm btn-dark image-action-btn cropBtn" title="Crop Image">
                                <i class="bi bi-crop"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary image-action-btn replaceBtn" title="Replace Image">
                                <i class="bi bi-arrow-repeat"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-danger image-action-btn removeBtn" title="Remove Image">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                    <input type="hidden" class="existing-url-input" value="${item.url}">
                    <input type="hidden" class="replace-target-input" value="${item.isReplaced ? item.url : ""}">
                    <input type="file" class="replace-image-file-input" style="display:none;">
                `;

                // Bind actions
                col.querySelector(".cropBtn").addEventListener("click", () => {
                    this.batchQueue = [];
                    this.openCropperForItem(item, card, "EXISTING", false);
                });

                col.querySelector(".replaceBtn").addEventListener("click", () => {
                    this.startReplaceExisting(card, item);
                });

                col.querySelector(".removeBtn").addEventListener("click", () => {
                    this.removeExistingImage(card, item);
                });

                // Attach replacement file if replaced
                if (item.isReplaced && item.replacementFile) {
                    const replaceInput = col.querySelector(".replace-image-file-input");
                    const dt = new DataTransfer();
                    dt.items.add(item.replacementFile);
                    replaceInput.files = dt.files;
                }

                existingContainer.appendChild(col);
            });
        }

        // 2. Render New Images
        const newContainer = card.querySelector(".newImagePreviewContainer");
        if (newContainer) {
            newContainer.innerHTML = "";
            const parentCol = newContainer.closest(".col-12");
            if (parentCol) {
                parentCol.style.display = state.newImages.length > 0 ? "" : "none";
            }

            state.newImages.forEach((item, idx) => {
                const col = document.createElement("div");
                col.className = "col-6 col-sm-4 col-md-3 mb-3 new-image-col";

                const badgeHtml = item.isCropped
                    ? `<span class="image-status-badge badge bg-success text-white shadow-sm"><i class="bi bi-check-lg me-1"></i>Cropped</span>`
                    : `<span class="image-status-badge badge bg-primary text-white shadow-sm">New</span>`;

                col.innerHTML = `
                    <div class="card h-100 image-preview-card">
                        <img src="${item.blobUrl}" class="image-preview-thumb" alt="Product variant image">
                        ${badgeHtml}
                        <div class="image-action-overlay">
                            <button type="button" class="btn btn-sm btn-dark image-action-btn cropBtn" title="Crop Image">
                                <i class="bi bi-crop"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-secondary image-action-btn replaceBtn" title="Replace Image">
                                <i class="bi bi-arrow-repeat"></i>
                            </button>
                            <button type="button" class="btn btn-sm btn-danger image-action-btn removeBtn" title="Remove Image">
                                <i class="bi bi-trash"></i>
                            </button>
                        </div>
                    </div>
                `;

                // Bind actions
                col.querySelector(".cropBtn").addEventListener("click", () => {
                    this.batchQueue = [];
                    this.openCropperForItem(item, card, "NEW", false);
                });

                col.querySelector(".replaceBtn").addEventListener("click", () => {
                    this.startReplaceNew(card, item);
                });

                col.querySelector(".removeBtn").addEventListener("click", () => {
                    this.removeNewImage(card, item);
                });

                newContainer.appendChild(col);
            });
        }
    }
}

// Global ImageManager instance
const ImageManager = new ProductImageManager();
window.ImageManager = ImageManager;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => ImageManager.init());
} else {
    ImageManager.init();
}
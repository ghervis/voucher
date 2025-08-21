<script lang="ts">
  import { onMount } from "svelte";
  import { base } from "$app/paths";

  interface DiscountArticle {
    id: string;
    dataType: string;
    title?: string;
    content?: string;
    couponCode?: string;
    headline?: string;
    description?: string;
    merchantName?: string;
  }

  interface CustomVoucher {
    id: string;
    code: string;
    description: string;
    merchantName?: string;
  }

  let isLoading = true;
  let error: string | null = null;
  let discountArticles: DiscountArticle[] = [];
  let copiedCode: string | null = null;
  let copyTimeout: ReturnType<typeof setTimeout> | null = null;

  // Custom vouchers management
  let customVouchers: CustomVoucher[] = [];
  let editingVoucher: CustomVoucher | null = null;
  let newVoucherCode = "";
  let newVoucherDescription = "";
  let newVoucherMerchant = "GrabFood";
  let dialog: HTMLDialogElement;
  let confirmDialog: HTMLDialogElement;
  let voucherToDelete: CustomVoucher | null = null;
  let hideConfirmDialog: HTMLDialogElement;
  let voucherToHide: { id: string; voucherCode: string } | null = null;
  let hiddenVouchers: string[] = [];
  let expandedDescriptions: Set<string> = new Set();

  // Long-press hard refresh functionality
  let longPressTimer: ReturnType<typeof setTimeout> | null = null;
  let isLongPressing = false;
  let longPressProgress = 0;
  let longPressInterval: ReturnType<typeof setInterval> | null = null;
  let showHardRefreshInstruction = false;
  let showHardRefreshButtonText = false;

  let hiddenCategories: { [key: string]: boolean } = {};
  const CATEGORY_VISIBILITY_KEY = "voucher-category-visibility";

  const CUSTOM_VOUCHERS_KEY = "grabfood-custom-vouchers";

  $: filteredDiscountArticles = discountArticles.filter((article) => {
    return !hiddenVouchers.includes(article.couponCode || "");
  });

  // Combined list: custom vouchers first, then fetched vouchers (filtered by category visibility)
  $: combinedVouchers = [
    ...customVouchers
      .filter((voucher) => {
        // Hide custom vouchers if their merchant matches hidden categories
        if (voucher.merchantName?.toLowerCase().includes("grabfood")) {
          return !hiddenCategories["grabfood"];
        }
        if (voucher.merchantName?.toLowerCase().includes("foodpanda")) {
          return !hiddenCategories["foodpanda"];
        }
        return true; // Show custom vouchers without specific merchant matches
      })
      .map((voucher) => ({
        ...voucher,
        isCustom: true,
        voucherCode: voucher.code,
        description: voucher.description,
      })),
    ...filteredDiscountArticles
      .filter((article) => {
        if (article.merchantName?.toLowerCase().includes("grabfood")) {
          return !hiddenCategories["grabfood"];
        }
        if (article.merchantName?.toLowerCase().includes("foodpanda")) {
          return !hiddenCategories["foodpanda"];
        }
        return true; // Show other merchants if not specifically hidden
      })
      .map((article) => ({
        ...article,
        isCustom: false,
        voucherCode: article.couponCode,
        description: article.content, // Map content to description for display
      })),
  ];

  // Count only vouchers with valid codes (not null or empty)
  $: validCustomVouchers = customVouchers.filter(
    (voucher) => voucher.code && voucher.code.trim() !== ""
  ).length;

  $: validGrabFoodVouchers = filteredDiscountArticles.filter(
    (article) =>
      article.couponCode &&
      article.couponCode.trim() !== "" &&
      article.merchantName?.toLowerCase().includes("grabfood")
  ).length;

  $: validFoodPandaVouchers = filteredDiscountArticles.filter(
    (article) =>
      article.couponCode &&
      article.couponCode.trim() !== "" &&
      article.merchantName?.toLowerCase().includes("foodpanda")
  ).length;

  // Custom vouchers management functions
  function loadCustomVouchers() {
    try {
      const saved = localStorage.getItem(CUSTOM_VOUCHERS_KEY);
      if (saved) {
        customVouchers = JSON.parse(saved);
      }
    } catch (error) {
      console.error("Error loading custom vouchers:", error);
    }
  }

  function saveCustomVouchers() {
    try {
      localStorage.setItem(CUSTOM_VOUCHERS_KEY, JSON.stringify(customVouchers));
    } catch (error) {
      console.error("Error saving custom vouchers:", error);
    }
  }

  // Hidden vouchers management functions
  function loadHiddenVouchers() {
    try {
      const stored = localStorage.getItem("hidden-vouchers");
      hiddenVouchers = stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error("Error loading hidden vouchers:", error);
      hiddenVouchers = [];
    }
  }

  function hideVoucher(voucherCode: string) {
    if (!hiddenVouchers.includes(voucherCode)) {
      hiddenVouchers = [...hiddenVouchers, voucherCode];
      localStorage.setItem("hidden-vouchers", JSON.stringify(hiddenVouchers));
    }
  }

  function addCustomVoucher() {
    if (!newVoucherCode.trim()) return;

    const newVoucher: CustomVoucher = {
      id: Date.now().toString(),
      code: newVoucherCode.trim(),
      description: newVoucherDescription.trim() || "Custom voucher",
      merchantName: newVoucherMerchant,
    };

    customVouchers = [newVoucher, ...customVouchers];
    saveCustomVouchers();
    resetForm();
    dialog.close();
  }

  function updateCustomVoucher() {
    if (!editingVoucher || !newVoucherCode.trim()) return;

    customVouchers = customVouchers.map((voucher) =>
      voucher.id === editingVoucher!.id
        ? {
            ...voucher,
            code: newVoucherCode.trim(),
            description: newVoucherDescription.trim() || "Custom voucher",
            merchantName: newVoucherMerchant,
          }
        : voucher
    );

    saveCustomVouchers();
    resetForm();
    dialog.close();
  }

  function deleteCustomVoucher(id: string) {
    customVouchers = customVouchers.filter((voucher) => voucher.id !== id);
    saveCustomVouchers();
  }

  function confirmDeleteVoucher(voucher: CustomVoucher) {
    voucherToDelete = voucher;
    confirmDialog.showModal();
  }

  function handleDeleteConfirm() {
    if (voucherToDelete) {
      deleteCustomVoucher(voucherToDelete.id);
      voucherToDelete = null;
    }
    confirmDialog.close();
  }

  function handleDeleteCancel() {
    voucherToDelete = null;
    confirmDialog.close();
  }

  function confirmHideVoucher(voucher: { id: string; voucherCode: string }) {
    voucherToHide = voucher;
    hideConfirmDialog.showModal();
  }

  function handleHideConfirm() {
    if (voucherToHide) {
      hideVoucher(voucherToHide.voucherCode);
      voucherToHide = null;
    }
    hideConfirmDialog.close();
  }

  function handleHideCancel() {
    voucherToHide = null;
    hideConfirmDialog.close();
  }

  function editCustomVoucher(voucher: CustomVoucher) {
    editingVoucher = voucher;
    newVoucherCode = voucher.code;
    newVoucherDescription = voucher.description;
    newVoucherMerchant = voucher.merchantName || "GrabFood";
    dialog.showModal();
  }

  function resetForm() {
    editingVoucher = null;
    newVoucherCode = "";
    newVoucherDescription = "";
    newVoucherMerchant = "GrabFood";
  }

  // Category visibility functions
  function loadCategoryVisibility() {
    try {
      const saved = localStorage.getItem(CATEGORY_VISIBILITY_KEY);
      if (saved) {
        hiddenCategories = JSON.parse(saved);
      }
    } catch (error) {
      console.error("Error loading category visibility:", error);
      hiddenCategories = {};
    }
  }

  function saveCategoryVisibility() {
    try {
      localStorage.setItem(
        CATEGORY_VISIBILITY_KEY,
        JSON.stringify(hiddenCategories)
      );
    } catch (error) {
      console.error("Error saving category visibility:", error);
    }
  }

  function toggleCategoryVisibility(category: string) {
    if (category === "grabfood" || category === "foodpanda") {
      // For grabfood and foodpanda, only one can be hidden at a time
      if (hiddenCategories[category]) {
        // If currently hidden, show it
        hiddenCategories[category] = false;
      } else {
        // If currently shown, hide it and ensure the other is shown
        hiddenCategories[category] = true;
        const otherCategory =
          category === "grabfood" ? "foodpanda" : "grabfood";
        hiddenCategories[otherCategory] = false;
      }
    } else {
      // For other categories, use normal toggle behavior
      hiddenCategories[category] = !hiddenCategories[category];
    }
    saveCategoryVisibility();
  }

  function resetCategoryVisibility() {
    hiddenCategories = {};
    localStorage.removeItem(CATEGORY_VISIBILITY_KEY);
  }

  // Long press functionality
  function startLongPress() {
    if (isLoading) return;

    isLongPressing = true;
    longPressProgress = 0;
    showHardRefreshInstruction = true; // Show immediately
    showHardRefreshButtonText = false;

    // Show button text after 1 second
    setTimeout(() => {
      if (isLongPressing) {
        showHardRefreshButtonText = true;
      }
    }, 1000);

    // Update progress every 20ms for smooth animation
    longPressInterval = setInterval(() => {
      longPressProgress += (20 / 4000) * 100; // 4 seconds = 100%
      if (longPressProgress >= 100) {
        longPressProgress = 100;
        clearInterval(longPressInterval!);
        longPressInterval = null;
      }
    }, 20);

    // Trigger hard refresh after 4 seconds
    longPressTimer = setTimeout(() => {
      endLongPress();
      fetchGrabFoodVouchers(true); // Hard refresh
    }, 4000);
  }

  function endLongPress() {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (longPressInterval) {
      clearInterval(longPressInterval);
      longPressInterval = null;
    }
    isLongPressing = false;
    longPressProgress = 0;
    showHardRefreshInstruction = false;
    showHardRefreshButtonText = false;
  }

  function handleRefreshClick() {
    if (!isLongPressing) {
      fetchGrabFoodVouchers(false); // Regular refresh
    }
  }

  async function fetchGrabFoodVouchers(hardRefresh = false) {
    try {
      isLoading = true;
      error = null;

      // Hard refresh clears hidden vouchers
      if (hardRefresh) {
        hiddenVouchers = [];
        localStorage.removeItem("hidden-vouchers");
      }

      // Multiple target URLs to fetch vouchers from
      const targetUrls = [
        "https://iprice.ph/?s=grabfood",
        "https://iprice.ph/?s=foodpanda",
      ];
      const proxyUrl = "https://corsproxy.io/?";

      const extractedArticles: DiscountArticle[] = [];

      // Fetch from each target URL
      for (const targetUrl of targetUrls) {
        console.log(
          `Fetching from: ${targetUrl}${hardRefresh ? " (hard refresh)" : ""}`
        );
        const fetchUrl = proxyUrl + encodeURIComponent(targetUrl);
        const fetchOptions: RequestInit = {};

        // Add cache-busting for hard refresh
        if (hardRefresh) {
          fetchOptions.cache = "no-cache";
          fetchOptions.headers = {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
          };
        }

        const response = await fetch(
          fetchUrl + (hardRefresh ? `&_t=${Date.now()}` : ""),
          fetchOptions
        );

        if (!response.ok) {
          console.error(
            `HTTP error for ${targetUrl}! status: ${response.status}`
          );
          continue; // Skip this URL and try the next one
        }

        const htmlContent = await response.text();

        // Parse HTML content to extract elements with data-clipboard-text
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlContent, "text/html");

        // Find all elements with data-clipboard-text attribute (these contain voucher codes)
        const voucherElements = doc.querySelectorAll("[data-clipboard-text]");

        voucherElements.forEach((element, index) => {
          const voucherCode = element.getAttribute("data-clipboard-text") || "";

          if (voucherCode) {
            // Generate a unique ID for this voucher
            const id = `voucher-${targetUrl.includes("grabfood") ? "grabfood" : "foodpanda"}-${index}`;

            // Try to find the closest article or container for title and description
            const container =
              element.closest("article, .voucher, .coupon, .deal") ||
              element.parentElement;

            // Extract title
            const titleElement =
              container?.querySelector(
                'h1, h2, h3, h4, .title, [class*="title"], .heading, [class*="heading"]'
              ) || element;
            const title = titleElement?.textContent?.trim() || "No title found";

            // Extract content/description - look for h2 > a elements first
            const contentElement = container?.querySelector(
              'h2 a, h2 > a, h2.flowhidden.mb10.mt0.fontnormal.position-relative a, h2[class*="flowhidden"] a, h2[class*="mb10"] a, p, .description, [class*="description"], .content, [class*="content"]'
            );
            const content =
              contentElement?.textContent?.trim() || "No description found";

            // Determine merchant name based on URL
            const merchantName = targetUrl.includes("grabfood")
              ? "GrabFood"
              : "FoodPanda";

            extractedArticles.push({
              id,
              dataType: "code",
              title,
              content,
              couponCode: voucherCode,
              merchantName,
            });
          }
        });
      }

      discountArticles = extractedArticles;

      console.log(
        "Found vouchers with data-clipboard-text:",
        extractedArticles.length
      );
      console.log("Extracted vouchers:", extractedArticles);

      // Update loading state
      isLoading = false;
    } catch (err) {
      error = err instanceof Error ? err.message : "An unknown error occurred";
      console.error("Error fetching vouchers:", err);
    } finally {
      isLoading = false;
    }
  }

  // Fetch data when component mounts
  onMount(() => {
    fetchGrabFoodVouchers();
    loadCustomVouchers();
    loadHiddenVouchers();
    loadCategoryVisibility();
  });

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      // Clear any existing timeout
      if (copyTimeout) {
        clearTimeout(copyTimeout);
      }

      // Show copied feedback
      copiedCode = text;

      // Hide feedback after 2 seconds
      copyTimeout = setTimeout(() => {
        copiedCode = null;
        copyTimeout = null;
      }, 2000);
    });
  }
</script>

<div
  class="h-screen flex flex-col bg-cover bg-center bg-no-repeat"
  style="background-image: url('{base}/background.png');"
>
  <!-- Fixed Header -->
  <div class="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
      <div class="flex flex-row items-start justify-between gap-4">
        <div class="flex-1">
          {#if validCustomVouchers > 0 || validGrabFoodVouchers > 0 || validFoodPandaVouchers > 0 || hiddenVouchers.length > 0}
            <div class="text-sm sm:text-base font-medium space-y-1">
              {#if validCustomVouchers > 0}
                <div class="text-purple-600">{validCustomVouchers} Custom</div>
              {/if}
              {#if validGrabFoodVouchers > 0}
                <button
                  on:click={() => toggleCategoryVisibility("grabfood")}
                  class="text-green-700 font-semibold flex items-center hover:bg-gray-100 rounded transition-colors py-1 pr-1"
                  title={hiddenCategories["grabfood"]
                    ? "Show GrabFood vouchers"
                    : "Hide GrabFood vouchers"}
                >
                  <span>{validGrabFoodVouchers} GrabFood</span>
                  <div class="ml-1">
                    {#if hiddenCategories["grabfood"]}
                      <!-- Eye slashed icon -->
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      </svg>
                    {:else}
                      <!-- Eye icon -->
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    {/if}
                  </div>
                </button>
              {/if}
              {#if validFoodPandaVouchers > 0}
                <button
                  on:click={() => toggleCategoryVisibility("foodpanda")}
                  class="text-pink-700 font-semibold flex items-center hover:bg-gray-100 rounded transition-colors py-1 pr-1"
                  title={hiddenCategories["foodpanda"]
                    ? "Show FoodPanda vouchers"
                    : "Hide FoodPanda vouchers"}
                >
                  <span>{validFoodPandaVouchers} FoodPanda</span>
                  <div class="ml-1">
                    {#if hiddenCategories["foodpanda"]}
                      <!-- Eye slashed icon -->
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"
                        />
                      </svg>
                    {:else}
                      <!-- Eye icon -->
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        class="h-4 w-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                        />
                      </svg>
                    {/if}
                  </div>
                </button>
              {/if}
              {#if hiddenVouchers.length > 0}
                <div class="text-gray-500">{hiddenVouchers.length} Hidden</div>
              {/if}
            </div>
          {/if}
        </div>

        <div class="flex flex-col gap-2 items-end flex-shrink-0">
          <button
            on:click={() => {
              resetForm();
              dialog.showModal();
            }}
            class="px-4 sm:px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-xs sm:text-sm whitespace-nowrap"
          >
            Add Custom Voucher
          </button>
          <div class="flex flex-col gap-2 items-end">
            <div class="relative">
              <button
                on:click={handleRefreshClick}
                on:mousedown={startLongPress}
                on:mouseup={endLongPress}
                on:mouseleave={endLongPress}
                on:touchstart={startLongPress}
                on:touchend={endLongPress}
                on:touchcancel={endLongPress}
                class="px-4 sm:px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium text-xs sm:text-sm whitespace-nowrap relative overflow-hidden"
                disabled={isLoading}
                title="Click to refresh vouchers, hold for 4 seconds for hard refresh"
              >
                <!-- Progress bar for long press -->
                {#if isLongPressing}
                  <div
                    class="absolute inset-0 transition-all duration-50"
                    style="width: {longPressProgress}%; background-color: #ff4500;"
                  ></div>
                {/if}

                <div class="flex items-center justify-center relative z-10">
                  {#if isLoading}
                    <svg
                      class="animate-spin h-4 w-4 text-white"
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        class="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        stroke-width="4"
                      ></circle>
                      <path
                        class="opacity-75"
                        fill="currentColor"
                        d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      ></path>
                    </svg>
                  {:else}
                    {showHardRefreshButtonText ? "Hard Refresh" : "Refresh"}
                  {/if}
                </div>
              </button>

              <!-- Long press instruction text -->
              {#if showHardRefreshInstruction}
                <div
                  class="absolute top-full mt-1 right-0 text-xs text-gray-600 whitespace-nowrap"
                >
                  Hold to hard refresh
                </div>
              {/if}
            </div>
          </div>
          <svg
            class="animate-spin h-4 w-4 text-white"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              class="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              stroke-width="4"
            ></circle>
            <path
              class="opacity-75"
              fill="currentColor"
              d="m4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            ></path>
          </svg>
        </div>
      </div>
    </div>
  </div>

  <!-- Scrollable Content Area -->
  <div class="flex-1 overflow-y-auto">
    <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      <!-- Copy Success Toast -->
      {#if copiedCode}
        <div
          class="fixed top-20 right-4 bg-green-600 text-white px-4 py-3 rounded-lg shadow-lg z-20 flex items-center gap-2"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M5 13l4 4L19 7"
            />
          </svg>
          <span class="text-sm font-medium">Copied "{copiedCode}"!</span>
        </div>
      {/if}

      <!-- Error State -->
      {#if error}
        <div
          class="bg-red-50 border border-red-200 rounded-lg p-4 sm:p-6 mb-6 sm:mb-8 mx-2 sm:mx-0"
        >
          <h3 class="text-red-800 font-semibold mb-2 text-sm sm:text-base">
            Error Loading Data
          </h3>
          <p class="text-red-600 mb-4 text-sm">{error}</p>
          <button
            on:click={() => fetchGrabFoodVouchers(false)}
            class="w-full sm:w-auto px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
          >
            Try Again
          </button>
        </div>
      {/if}

      <!-- Combined Vouchers Section -->
      {#if !error}
        <!-- Combined Voucher Codes List -->
        {#if combinedVouchers.length > 0}
          <div class="space-y-3 sm:space-y-4 mb-6 sm:mb-8">
            {#each combinedVouchers as voucher}
              {#if voucher.voucherCode}
                <div
                  class="p-3 sm:p-4 rounded-lg border shadow-lg {('merchantName' in
                    voucher &&
                    voucher.merchantName?.toLowerCase().includes('grabfood')) ||
                  ('merchantName' in voucher &&
                    voucher.merchantName?.toLowerCase().includes('grab'))
                    ? 'bg-green-100/95 border-green-300/100'
                    : 'merchantName' in voucher &&
                        voucher.merchantName
                          ?.toLowerCase()
                          .includes('foodpanda')
                      ? 'bg-pink-100/95 border-pink-300/100'
                      : 'bg-gray-200/95 border-gray-400/100'}"
                >
                  <div class="mb-3">
                    <button
                      on:click={() =>
                        copyToClipboard(voucher.voucherCode || "")}
                      class="w-full text-base sm:text-lg font-bold font-mono bg-white/95 px-3 py-2 rounded border border-white/60 break-all flex items-center justify-between hover:bg-white transition-all cursor-pointer shadow-sm {('merchantName' in
                        voucher &&
                        voucher.merchantName
                          ?.toLowerCase()
                          .includes('grabfood')) ||
                      ('merchantName' in voucher &&
                        voucher.merchantName?.toLowerCase().includes('grab'))
                        ? 'text-green-700'
                        : 'merchantName' in voucher &&
                            voucher.merchantName
                              ?.toLowerCase()
                              .includes('foodpanda')
                          ? 'text-pink-700'
                          : 'text-gray-700'}"
                      title="Click to copy voucher code"
                      aria-label="Copy voucher code"
                    >
                      <span class="flex-1 text-left">{voucher.voucherCode}</span
                      >
                      <div class="flex items-center gap-2 ml-2 flex-shrink-0">
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          class="h-5 w-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                    </button>
                  </div>

                  {#if voucher.description}
                    <div class="mt-3 relative">
                      <button
                        class="text-left w-full text-gray-600 text-sm leading-relaxed pr-20 hover:text-gray-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50 rounded"
                        class:line-clamp-1={!expandedDescriptions.has(
                          voucher.id || voucher.voucherCode
                        )}
                        class:sm:line-clamp-2={!expandedDescriptions.has(
                          voucher.id || voucher.voucherCode
                        )}
                        class:overflow-hidden={!expandedDescriptions.has(
                          voucher.id || voucher.voucherCode
                        )}
                        class:text-ellipsis={!expandedDescriptions.has(
                          voucher.id || voucher.voucherCode
                        )}
                        class:break-words={!expandedDescriptions.has(
                          voucher.id || voucher.voucherCode
                        )}
                        on:click={() => {
                          const voucherId = voucher.id || voucher.voucherCode;
                          if (voucherId) {
                            if (expandedDescriptions.has(voucherId)) {
                              expandedDescriptions.delete(voucherId);
                            } else {
                              expandedDescriptions.add(voucherId);
                            }
                            expandedDescriptions = expandedDescriptions;
                          }
                        }}
                      >
                        {voucher.description || "No description available"}
                      </button>

                      {#if voucher.isCustom}
                        <div class="absolute top-0 right-0 flex gap-2">
                          <button
                            on:click={() =>
                              editCustomVoucher({
                                id: voucher.id,
                                code: voucher.voucherCode || "",
                                description: voucher.description || "",
                              })}
                            class="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors text-sm shadow-sm"
                            title="Edit voucher"
                          >
                            Edit
                          </button>
                          <button
                            on:click={() =>
                              confirmDeleteVoucher({
                                id: voucher.id,
                                code: voucher.voucherCode || "",
                                description: voucher.description || "",
                              })}
                            class="px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm shadow-sm"
                            title="Delete voucher"
                          >
                            Delete
                          </button>
                        </div>
                      {:else}
                        <div class="absolute top-0 right-0 flex gap-2">
                          <button
                            on:click={() =>
                              confirmHideVoucher({
                                id: voucher.id,
                                voucherCode: voucher.voucherCode || "",
                              })}
                            class="px-3 py-1 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors text-sm shadow-sm"
                            title="Hide voucher"
                          >
                            Hide
                          </button>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {:else if !isLoading}
          <div
            class="text-center py-8 bg-gray-50 rounded-lg border border-gray-200"
          >
            <p class="text-gray-500 mb-2">No vouchers available</p>
            <p class="text-sm text-gray-400">
              Add a custom voucher or refresh to fetch GrabFood vouchers
            </p>
          </div>
        {/if}

        <!-- Loading indicator for progressive fetching -->
        {#if isLoading}
          <div class="text-center py-8">
            <div
              class="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"
            ></div>
            <p class="text-gray-600 mt-2 text-sm">Fetching more vouchers...</p>
          </div>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Add/Edit Custom Voucher Modal -->
  <dialog
    bind:this={dialog}
    class="p-0 rounded-lg shadow-xl max-w-md"
    style="margin: 1rem auto; width: calc(100% - 2rem);"
  >
    <div class="p-6">
      <div class="flex justify-between items-center mb-4">
        <h3 class="text-lg font-semibold text-purple-800">
          {editingVoucher ? "Edit" : "Add"} Custom Voucher
        </h3>
        <button
          on:click={() => dialog.close()}
          class="text-gray-400 hover:text-gray-600 transition-colors"
          aria-label="Close modal"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Privacy Note -->
      <div class="mb-4 p-2 bg-blue-50 border border-blue-200 rounded-lg">
        <div class="flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-4 w-4 text-blue-600 flex-shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p class="text-xs text-blue-700">Only you can see this addition.</p>
        </div>
      </div>

      <form
        on:submit|preventDefault={editingVoucher
          ? updateCustomVoucher
          : addCustomVoucher}
        class="space-y-4"
      >
        <div>
          <label
            for="modal-voucher-code"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Voucher Code *
          </label>
          <input
            id="modal-voucher-code"
            type="text"
            bind:value={newVoucherCode}
            placeholder="Enter voucher code"
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          />
        </div>
        <div>
          <label
            for="modal-voucher-merchant"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Merchant *
          </label>
          <select
            id="modal-voucher-merchant"
            bind:value={newVoucherMerchant}
            required
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="GrabFood">GrabFood</option>
            <option value="Foodpanda">Foodpanda</option>
          </select>
        </div>
        <div>
          <label
            for="modal-voucher-description"
            class="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <textarea
            id="modal-voucher-description"
            bind:value={newVoucherDescription}
            placeholder="Enter description (optional)"
            rows="3"
            class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          ></textarea>
        </div>
        <div class="flex gap-2 pt-4">
          <button
            type="submit"
            class="flex-1 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-medium text-sm"
          >
            {editingVoucher ? "Update" : "Add"} Voucher
          </button>
          <button
            type="button"
            on:click={() => dialog.close()}
            class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  </dialog>

  <!-- Delete Confirmation Modal -->
  <dialog
    bind:this={confirmDialog}
    class="p-0 rounded-lg shadow-xl max-w-sm"
    style="margin: 1rem auto; width: calc(100% - 2rem);"
  >
    <div class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.502 0L4.312 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900">Delete Voucher</h3>
          <p class="text-sm text-gray-600 mt-1">
            Are you sure you want to delete "{voucherToDelete?.code}"? This
            action cannot be undone.
          </p>
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          on:click={handleDeleteCancel}
          class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleDeleteConfirm}
          class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-medium text-sm"
        >
          Delete
        </button>
      </div>
    </div>
  </dialog>

  <!-- Hide Confirmation Modal -->
  <dialog
    bind:this={hideConfirmDialog}
    class="p-0 rounded-lg shadow-xl max-w-sm"
    style="margin: 1rem auto; width: calc(100% - 2rem);"
  >
    <div class="p-6">
      <div class="flex items-center gap-3 mb-4">
        <div class="flex-shrink-0">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            class="h-6 w-6 text-yellow-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L12 12"
            />
          </svg>
        </div>
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900">Hide Voucher</h3>
          <p class="text-sm text-gray-600 mt-1">
            Are you sure you want to hide "{voucherToHide?.voucherCode}"? Hidden
            vouchers will reappear when you refresh the page.
          </p>
        </div>
      </div>

      <div class="flex gap-3 justify-end">
        <button
          type="button"
          on:click={handleHideCancel}
          class="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors font-medium text-sm"
        >
          Cancel
        </button>
        <button
          type="button"
          on:click={handleHideConfirm}
          class="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-medium text-sm"
        >
          Hide
        </button>
      </div>
    </div>
  </dialog>

  <style>
    dialog::backdrop {
      background-color: rgba(0, 0, 0, 0.3);
    }

    .line-clamp-1 {
      display: -webkit-box;
      -webkit-line-clamp: 1;
      line-clamp: 1;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
  </style>
</div>

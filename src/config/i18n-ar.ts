import type { fr } from "./i18n-fr";

// Arabic UI strings: the type guarantees every French key is translated.
export const ar: Record<keyof typeof fr, string> = {
  addToCart: "أضف إلى السلة", orderNow: "اطلب الآن", soldOut: "نفدت الكمية",
  cart: "السلة", cartEmpty: "سلتك فارغة", subtotal: "المجموع الفرعي", shipping: "التوصيل",
  freeShipping: "توصيل مجاني", total: "المجموع", checkout: "اطلب",
  freeShippingProgress: "بقي {amount} للحصول على التوصيل المجاني",
  fullName: "الاسم الكامل", phone: "رقم الهاتف", phonePlaceholder: "06 XX XX XX XX",
  phoneInvalid: "رقم هاتف مغربي غير صالح", nameRequired: "الاسم مطلوب",
  cod: "الدفع عند الاستلام", confirmOrder: "تأكيد الطلب", sending: "جارٍ الإرسال…",
  upsellTitle: "عرض خاص لك", upsellAccept: "نعم، أضف", upsellDecline: "لا شكرا",
  upsellEndsIn: "ينتهي خلال {s} ثانية", thankYouTitle: "شكرا على طلبك!",
  thankYouText: "سيتصل بك فريقنا لتأكيد طلبك.",
  orderNumber: "رقم الطلب", contactWhatsapp: "تواصل معنا عبر واتساب",
  chooseOption: "اختر {name}", quantity: "الكمية", packs: "اختر عرضك",
  pieces: "{n} قطع", piece: "قطعة واحدة", increase: "زيادة الكمية", decrease: "تقليل الكمية",
  ratingOutOf: "التقييم: {rating} من 5", menu: "القائمة", remove: "إزالة", information: "معلومات", save: "وفّر {amount}", bestValue: "أفضل عرض",
  differentOptions: "اختيار خيارات مختلفة", unit: "المنتج {n}",
  home: "الرئيسية", shop: "المتجر", about: "من نحن", contact: "اتصل بنا",
  shippingReturns: "التوصيل والإرجاع", terms: "شروط البيع", privacy: "الخصوصية",
  faq: "الأسئلة الشائعة", reviews: "آراء الزبناء", bestSellers: "الأكثر مبيعا",
  youMayLike: "قد يعجبك أيضا", genericError: "حدث خطأ، حاول مرة أخرى.",
  retryLater: "محاولات كثيرة، حاول بعد قليل.",
  viewOffer: "شاهد العرض", sizeGuide: "دليل المقاسات", noProducts: "لا توجد منتجات حاليا.",
  categories: "الفئات", productDescription: "الوصف", viewAll: "عرض الكل",
};

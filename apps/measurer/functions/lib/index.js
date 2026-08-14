"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendOrderToManager = void 0;
const functions = require("firebase-functions");
const nodemailer = require("nodemailer");
function getConfig() {
    var _a, _b, _c;
    const config = functions.config();
    return {
        managerEmail: ((_a = config.manager) === null || _a === void 0 ? void 0 : _a.email) || process.env.MANAGER_EMAIL || "",
        gmailUser: ((_b = config.gmail) === null || _b === void 0 ? void 0 : _b.user) || process.env.GMAIL_USER || "",
        gmailPass: ((_c = config.gmail) === null || _c === void 0 ? void 0 : _c.pass) || process.env.GMAIL_APP_PASSWORD || "",
    };
}
/**
 * Callable: отправляет текст отчёта на почту менеджера.
 * В Firebase Console → Functions → Configuration задайте переменные:
 * MANAGER_EMAIL, GMAIL_USER, GMAIL_APP_PASSWORD (пароль приложения Gmail).
 */
exports.sendOrderToManager = functions.https.onCall(async (data, context) => {
    const text = data === null || data === void 0 ? void 0 : data.text;
    if (!text || typeof text !== "string") {
        throw new functions.https.HttpsError("invalid-argument", "Требуется поле text (строка).");
    }
    const { managerEmail, gmailUser, gmailPass } = getConfig();
    if (!managerEmail || !gmailUser || !gmailPass) {
        throw new functions.https.HttpsError("failed-precondition", "Не настроена отправка почты. Выполните: firebase functions:config:set manager.email=\"...\" gmail.user=\"...\" gmail.pass=\"...\"");
    }
    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: { user: gmailUser, pass: gmailPass },
    });
    try {
        await transporter.sendMail({
            from: gmailUser,
            to: managerEmail,
            subject: "Заказ с замера — Супермоскитка",
            text,
        });
    }
    catch (err) {
        console.error("Send mail error:", err);
        throw new functions.https.HttpsError("internal", "Не удалось отправить письмо. Проверьте настройки почты.");
    }
    return { success: true };
});
//# sourceMappingURL=index.js.map
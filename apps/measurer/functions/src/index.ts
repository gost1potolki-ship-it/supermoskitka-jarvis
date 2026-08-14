import * as functions from "firebase-functions";
import * as nodemailer from "nodemailer";

function getConfig() {
  const config = functions.config();
  return {
    managerEmail: config.manager?.email || process.env.MANAGER_EMAIL || "gost1potolki@gmail.com",
    gmailUser: config.gmail?.user || process.env.GMAIL_USER || "",
    gmailPass: config.gmail?.pass || process.env.GMAIL_APP_PASSWORD || "",
  };
}

/**
 * Callable: отправляет текст отчёта на почту менеджера.
 * В Firebase Console → Functions → Configuration задайте переменные:
 * MANAGER_EMAIL, GMAIL_USER, GMAIL_APP_PASSWORD (пароль приложения Gmail).
 */
export const sendOrderToManager = functions.https.onCall(async (data, context) => {
  const text = data?.text;
  if (!text || typeof text !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Требуется поле text (строка).");
  }
  const { managerEmail, gmailUser, gmailPass } = getConfig();
  if (!managerEmail || !gmailUser || !gmailPass) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Не настроена отправка почты. Выполните: firebase functions:config:set manager.email=\"...\" gmail.user=\"...\" gmail.pass=\"...\""
    );
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
  } catch (err) {
    console.error("Send mail error:", err);
    throw new functions.https.HttpsError("internal", "Не удалось отправить письмо. Проверьте настройки почты.");
  }
  return { success: true };
});

const VK_CHUNK = 4000;

function splitTextForVk(text: string, maxLen: number = VK_CHUNK): string[] {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  let rest = text;
  while (rest.length > 0) {
    if (rest.length <= maxLen) {
      chunks.push(rest);
      break;
    }
    const slice = rest.slice(0, maxLen);
    const lastDouble = slice.lastIndexOf("\n\n");
    const lastSingle = slice.lastIndexOf("\n");
    const lastSpace = slice.lastIndexOf(" ");
    const splitAt =
      lastDouble >= maxLen >> 1
        ? lastDouble + 2
        : lastSingle >= maxLen >> 1
          ? lastSingle + 1
          : lastSpace >= maxLen >> 1
            ? lastSpace + 1
            : maxLen;
    let part = rest.slice(0, splitAt).trimEnd();
    rest = rest.slice(splitAt).trimStart();
    if (!part) {
      part = rest.slice(0, maxLen);
      rest = rest.slice(maxLen);
    }
    if (part) chunks.push(part);
  }
  return chunks.filter(Boolean);
}

function getVkSecrets(): { token: string; peerId: string } {
  const cfg = functions.config() as { vk?: { group_token?: string; peer_id?: string } };
  return {
    token: process.env.VK_GROUP_TOKEN || cfg.vk?.group_token || "",
    peerId: process.env.VK_PEER_ID || cfg.vk?.peer_id || "",
  };
}

function randomIdVk(): number {
  return Math.floor(Math.random() * 2147483647);
}

/**
 * Callable: замерный лист в ВКонтакте (messages.send), обход CORS в WebView.
 * Конфиг: firebase functions:config:set vk.group_token="..." vk.peer_id="..."
 * или VK_GROUP_TOKEN / VK_PEER_ID в среде Cloud Functions.
 */
export const sendVkOrderReport = functions.https.onCall(async (data) => {
  const text = data?.text;
  if (!text || typeof text !== "string") {
    throw new functions.https.HttpsError("invalid-argument", "Требуется поле text (строка).");
  }
  const { token, peerId } = getVkSecrets();
  if (!token || !peerId) {
    throw new functions.https.HttpsError(
      "failed-precondition",
      "Для sendVkOrderReport задайте vk.group_token и vk.peer_id (functions:config) или VK_GROUP_TOKEN и VK_PEER_ID."
    );
  }
  const chunks = splitTextForVk(text);
  for (let i = 0; i < chunks.length; i++) {
    const body = new URLSearchParams({
      access_token: token,
      peer_id: peerId,
      message: chunks[i],
      random_id: String(randomIdVk()),
      v: "5.199",
    });
    const res = await fetch("https://api.vk.com/method/messages.send", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
      body: body.toString(),
    });
    const rawText = await res.text();
    let json: { response?: number; error?: { error_code: number; error_msg: string } } = {};
    try {
      json = JSON.parse(rawText) as typeof json;
    } catch {
      console.error("VK API: не JSON", res.status, rawText.slice(0, 500));
      throw new functions.https.HttpsError("internal", rawText || `HTTP ${res.status}`);
    }
    if (json.error) {
      console.error("VK API error:", json.error);
      throw new functions.https.HttpsError(
        "internal",
        json.error.error_msg || `VK ${json.error.error_code}`
      );
    }
    if (json.response === undefined) {
      console.error("VK API unexpected response", rawText.slice(0, 500));
      throw new functions.https.HttpsError("internal", "VK: пустой ответ");
    }
    if (i < chunks.length - 1) {
      await new Promise((r) => setTimeout(r, 350));
    }
  }
  return { success: true };
});

import { getFactValue, type OrderMemory } from '../../domain/index.js';

/** Compact current-value context for the main LLM (no fact history / sources). */
export function buildOrderMemoryContext(memory: OrderMemory): string {
  const lines: string[] = ['CURRENT ORDER MEMORY'];

  const customerLines: string[] = [];
  if (memory.customer) {
    for (const [field, fact] of Object.entries(memory.customer)) {
      const value = fact?.current.value;
      if (value !== undefined) {
        customerLines.push(`- ${field}: ${String(value)}`);
      }
    }
  }
  if (customerLines.length > 0) {
    lines.push('Customer:');
    lines.push(...customerLines);
  }

  if (memory.items.length > 0) {
    lines.push('Items:');
    for (const item of memory.items) {
      const parts: string[] = [];
      const productType = getFactValue(item.productType);
      const quantity = getFactValue(item.quantity);
      const widthMm = getFactValue(item.widthMm);
      const heightMm = getFactValue(item.heightMm);
      const meshType = getFactValue(item.meshType);
      const profileColor = getFactValue(item.profileColor);
      const ral = getFactValue(item.ral);
      const colorFinish = getFactValue(item.colorFinish);
      const fastening = getFactValue(item.fastening);
      const openingType = getFactValue(item.openingType);
      const profileType = getFactValue(item.profileType);
      const comment = getFactValue(item.comment);

      if (productType !== undefined) {
        parts.push(String(productType));
      }
      if (quantity !== undefined) {
        parts.push(`qty=${quantity}`);
      }
      if (widthMm !== undefined && heightMm !== undefined) {
        parts.push(`${widthMm}x${heightMm}`);
      } else {
        if (widthMm !== undefined) {
          parts.push(`width=${widthMm}`);
        }
        if (heightMm !== undefined) {
          parts.push(`height=${heightMm}`);
        }
      }
      if (meshType !== undefined) {
        parts.push(String(meshType));
      }
      if (profileType !== undefined) {
        parts.push(`profile=${profileType}`);
      }
      if (profileColor !== undefined) {
        parts.push(String(profileColor));
      }
      if (ral !== undefined) {
        parts.push(`RAL ${ral}`);
      }
      if (colorFinish !== undefined) {
        parts.push(String(colorFinish));
      }
      if (fastening !== undefined) {
        parts.push(String(fastening));
      }
      if (openingType !== undefined) {
        parts.push(String(openingType));
      }
      if (comment !== undefined) {
        parts.push(String(comment));
      }
      lines.push(`- ${item.id}: ${parts.length > 0 ? parts.join(', ') : '(empty)'}`);
    }
  } else {
    lines.push('Items: (none)');
  }

  const fulfillmentLines: string[] = [];
  if (memory.fulfillment) {
    for (const [field, fact] of Object.entries(memory.fulfillment)) {
      const value = fact?.current.value;
      if (value !== undefined) {
        fulfillmentLines.push(`- ${field}: ${String(value)}`);
      }
    }
  }
  if (fulfillmentLines.length > 0) {
    lines.push('Fulfillment:');
    lines.push(...fulfillmentLines);
  }

  lines.push('');
  lines.push(
    'Order Memory is internal. Do not mention field names, item IDs, sources, confidence, or extraction to the customer.',
  );

  return lines.join('\n');
}

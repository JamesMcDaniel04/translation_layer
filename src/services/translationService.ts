import { detectLanguage } from './languageDetector';
import { getTranslatorForTenant } from '../providers/factory';
import { trackUsage, trackBatchUsage, estimateCost } from './usageTracker';
import {
  NormalizeRequest,
  NormalizeResponse,
  BatchNormalizeRequest,
  BatchNormalizeResponse,
  NormalizeMeta,
  TranslatorProvider,
} from '../types';
import {
  generateRequestId,
  countChars,
  applyGlossary,
  removeGlossaryMarkers,
} from '../utils/helpers';
import { config } from '../config';

interface TenantContext {
  id: string;
  translator_provider: string;
  glossary: { preserve: string[] };
}

/**
 * Normalize a single text item
 */
export async function normalizeText(
  request: NormalizeRequest,
  tenant: TenantContext,
  requestId?: string
): Promise<NormalizeResponse> {
  const reqId = requestId || generateRequestId();
  const startTime = Date.now();

  // Step 1: Determine source language
  let sourceLang = request.source_lang;
  let detectedConfidence: number | undefined;

  if (!sourceLang) {
    const detection = await detectLanguage(request.text);
    sourceLang = detection.lang;
    detectedConfidence = detection.confidence;
  }

  // Step 2: Check if translation is needed
  const targetLang = request.target_lang || config.translation.defaultTargetLang;
  const textChars = countChars(request.text);

  // Skip translation if source equals target or source is unknown
  if (sourceLang === targetLang || sourceLang === 'und') {
    const estimated = estimateCost(textChars, 'none');
    const meta: NormalizeMeta = {
      detected_confidence: detectedConfidence,
      translator: 'none',
      detector: 'fastText',
      chars: textChars,
      estimated_cost_usd: estimated.estimated_usd,
      request_id: reqId,
    };

    // Track usage (no translation)
    await trackUsage({
      tenant_id: tenant.id,
      request_id: reqId,
      record_id: request.record_id,
      type: request.type,
      source_lang: sourceLang,
      target_lang: targetLang,
      chars_count: textChars,
      provider: 'none',
    });

    return {
      tenant_id: request.tenant_id,
      record_id: request.record_id,
      type: request.type,
      source_lang: sourceLang,
      target_lang: targetLang,
      text_original: request.text,
      text_normalized: request.text,
      meta,
    };
  }

  // Step 3: Apply glossary preservation
  let textToTranslate = request.text;
  const preserveTerms = tenant.glossary?.preserve || [];
  if (preserveTerms.length > 0) {
    textToTranslate = applyGlossary(request.text, preserveTerms);
  }

  // Step 4: Translate
  const translator = getTranslatorForTenant(tenant.translator_provider);
  const translationResult = await translator.translate(
    textToTranslate,
    sourceLang,
    targetLang
  );

  // Step 5: Remove glossary markers from result
  let normalizedText = translationResult.text;
  if (preserveTerms.length > 0) {
    normalizedText = removeGlossaryMarkers(normalizedText);
  }

  // Build metadata
  const meta: NormalizeMeta = {
    detected_confidence: detectedConfidence,
    translator: translator.name,
    detector: 'fastText',
    chars: textChars,
    estimated_cost_usd: estimateCost(textChars, translator.name).estimated_usd,
    request_id: reqId,
  };

  // Track usage
  await trackUsage({
    tenant_id: tenant.id,
    request_id: reqId,
    record_id: request.record_id,
    type: request.type,
    source_lang: sourceLang,
    target_lang: targetLang,
    chars_count: textChars,
    provider: translator.name,
  });

  console.info(
    `[${reqId}] Normalized ${textChars} chars: ${sourceLang} -> ${targetLang} (${Date.now() - startTime}ms)`
  );

  return {
    tenant_id: request.tenant_id,
    record_id: request.record_id,
    type: request.type,
    source_lang: translationResult.detectedSourceLang || sourceLang,
    target_lang: targetLang,
    text_original: request.text,
    text_normalized: normalizedText,
    meta,
  };
}

/**
 * Normalize multiple text items in batch
 */
export async function normalizeTextBatch(
  request: BatchNormalizeRequest,
  tenant: TenantContext
): Promise<BatchNormalizeResponse> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const targetLang = request.target_lang || config.translation.defaultTargetLang;

  // Process items - could be parallelized with Promise.all for better performance
  // but sequential processing is safer for rate limits
  const results: NormalizeResponse[] = [];
  let totalChars = 0;
  let totalEstimatedCost = 0;

  for (const item of request.items) {
    const result = await normalizeText(
      {
        tenant_id: request.tenant_id,
        record_id: item.record_id,
        type: item.type,
        text: item.text,
        source_lang: item.source_lang,
        target_lang: targetLang,
      },
      tenant,
      requestId
    );
    results.push(result);
    totalChars += countChars(item.text);
    totalEstimatedCost += result.meta.estimated_cost_usd || 0;
  }

  console.info(
    `[${requestId}] Batch normalized ${request.items.length} items, ${totalChars} chars (${Date.now() - startTime}ms)`
  );

  return {
    tenant_id: request.tenant_id,
    results,
    meta: {
      total_items: request.items.length,
      total_chars: totalChars,
      estimated_total_cost_usd: Math.round(totalEstimatedCost * 10000) / 10000,
      request_id: requestId,
    },
  };
}

/**
 * Parallel batch processing for higher throughput
 * Use with caution - may hit rate limits
 */
export async function normalizeTextBatchParallel(
  request: BatchNormalizeRequest,
  tenant: TenantContext,
  concurrency = 5
): Promise<BatchNormalizeResponse> {
  const requestId = generateRequestId();
  const startTime = Date.now();
  const targetLang = request.target_lang || config.translation.defaultTargetLang;

  // Process in batches of `concurrency`
  const results: NormalizeResponse[] = [];
  let totalChars = 0;
  let totalEstimatedCost = 0;

  for (let i = 0; i < request.items.length; i += concurrency) {
    const batch = request.items.slice(i, i + concurrency);
    const batchResults = await Promise.all(
      batch.map((item) =>
        normalizeText(
          {
            tenant_id: request.tenant_id,
            record_id: item.record_id,
            type: item.type,
            text: item.text,
            source_lang: item.source_lang,
            target_lang: targetLang,
          },
          tenant,
          requestId
        )
      )
    );

    results.push(...batchResults);
    batch.forEach((item) => {
      totalChars += countChars(item.text);
    });
    batchResults.forEach((result) => {
      totalEstimatedCost += result.meta.estimated_cost_usd || 0;
    });
  }

  console.info(
    `[${requestId}] Parallel batch normalized ${request.items.length} items, ${totalChars} chars (${Date.now() - startTime}ms)`
  );

  return {
    tenant_id: request.tenant_id,
    results,
    meta: {
      total_items: request.items.length,
      total_chars: totalChars,
      estimated_total_cost_usd: Math.round(totalEstimatedCost * 10000) / 10000,
      request_id: requestId,
    },
  };
}

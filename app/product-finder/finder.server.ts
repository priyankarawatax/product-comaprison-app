import { Prisma } from "@prisma/client";
import db from "../db.server";
import { defaultFinder, type FinderDraft, type FinderRuleSet } from "./config";

const include = { ruleSets: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }], include: { questions: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }], include: { answers: { orderBy: [{ position: "asc" as const }, { id: "asc" as const }] } } } } } };
type SavedFinder = Prisma.ProductFinderGetPayload<{ include: typeof include }>;

function draft(finder: SavedFinder): FinderDraft {
  return { version: finder.version, enabled: finder.enabled, title: finder.title, description: finder.description,
    buttonText: finder.buttonText, buttonPosition: finder.buttonPosition === "bottom_right" ? "bottom_left" : finder.buttonPosition, showDesktop: finder.showDesktop, showMobile: finder.showMobile,
    resultHeading: finder.resultHeading, recommendationLimit: finder.recommendationLimit,
    modalBackground: finder.modalBackground, modalTextColor: finder.modalTextColor, modalAccentColor: finder.modalAccentColor, modalBorderRadius: finder.modalBorderRadius, modalTitleSize: finder.modalTitleSize, modalQuestionSize: finder.modalQuestionSize,
    buttonBackground: finder.buttonBackground, buttonTextColor: finder.buttonTextColor, buttonBorderColor: finder.buttonBorderColor, buttonFontSize: finder.buttonFontSize,
    modalPadding: finder.modalPadding, answerPadding: finder.answerPadding, noMatchHeading: finder.noMatchHeading, noMatchDescription: finder.noMatchDescription,
    ruleSets: finder.ruleSets.map((rule) => ({ id: rule.key, name: rule.name, enabled: rule.enabled, sourceType: rule.sourceType as FinderDraft["ruleSets"][number]["sourceType"],
      collectionId: rule.collectionId, collectionTitle: rule.collectionTitle, vendor: rule.vendor, productId: rule.productId, productTitle: rule.productTitle,
      collections: (Array.isArray(rule.collections) ? rule.collections : rule.collectionId ? [{ id: rule.collectionId, title: rule.collectionTitle || "", imageUrl: null, productCount: null }] : []) as FinderRuleSet["collections"],
      vendors: (Array.isArray(rule.vendors) ? rule.vendors : rule.vendor ? [rule.vendor] : []) as FinderRuleSet["vendors"],
      products: (Array.isArray(rule.products) ? rule.products : rule.productId ? [{ id: rule.productId, title: rule.productTitle || "", imageUrl: null }] : []) as FinderRuleSet["products"],
      questions: rule.questions.map((question) => ({ id: question.key, templateQuestionId: question.templateQuestionId, question: question.question, mappingType: question.mappingType, fieldKey: question.fieldKey, required: question.required, selectionMode: question.selectionMode === "multiple" ? "multiple" : "single", enabled: question.enabled,
        answers: question.answers.map((answer) => ({ id: answer.key, label: answer.label, field: answer.field, operator: answer.operator, value: answer.value, weight: answer.weight })) })) })),
  };
}

export async function getFinder(shop: string) {
  const finder = await db.productFinder.findUnique({ where: { shop }, include });
  return finder ? draft(finder) : defaultFinder();
}

export class FinderConflict extends Error {}

export async function saveFinder(shop: string, input: FinderDraft) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT shop FROM stores WHERE shop = ${shop} FOR UPDATE`;
    const current = await tx.productFinder.findUnique({ where: { shop } });
    if ((current?.version ?? 0) !== input.version) throw new FinderConflict("These settings changed in another tab. Reload this page before saving again.");

    const submittedQuestions = input.ruleSets.flatMap((rule) => rule.questions);
    const submittedAnswers = submittedQuestions.flatMap((question) => question.answers);
    const existingRules = current ? await tx.productFinderRuleSet.findMany({
      where: { finderId: current.id, key: { in: input.ruleSets.map((rule) => rule.id) } },
      select: { id: true, key: true },
    }) : [];
    const ruleIds = new Map(existingRules.map((rule) => [rule.key, rule.id]));
    const questions = current ? await tx.productFinderQuestion.findMany({
      where: { finderId: current.id, key: { in: submittedQuestions.map((question) => question.id) } },
      select: { id: true, key: true, finderId: true, ruleSetId: true },
    }) : [];
    const questionIds = new Map(questions.map((question) => [question.key, question.id]));
    const expectedQuestionRules = new Map(input.ruleSets.flatMap((rule) => rule.questions.map((question) => [question.id, rule.id] as const)));
    const answers = await tx.productFinderAnswer.findMany({
      where: { key: { in: submittedAnswers.map((answer) => answer.id) } },
      select: { id: true, key: true, questionId: true },
    });
    const expectedAnswerQuestions = new Map(submittedQuestions.flatMap((question) => question.answers.map((answer) => [answer.id, question.id] as const)));
    if (questions.some((question) => question.finderId !== current?.id || question.ruleSetId !== ruleIds.get(expectedQuestionRules.get(question.key) || "")) ||
        answers.some((answer) => answer.questionId !== questionIds.get(expectedAnswerQuestions.get(answer.key) || ""))) {
      throw new FinderConflict("Rule, question, or answer ownership is invalid. Reload the page.");
    }

    const { ruleSets, version, ...settings } = input;
    const finder = current
      ? await tx.productFinder.update({ where: { id: current.id }, data: { ...settings, version: version + 1 } })
      : await tx.productFinder.create({ data: { ...settings, shop, version: 1 } });

    await tx.productFinderRuleSet.deleteMany({ where: ruleSets.length ? { finderId: finder.id, key: { notIn: ruleSets.map((rule) => rule.id) } } : { finderId: finder.id } });
    for (const [rulePosition, rule] of ruleSets.entries()) {
      const ruleValues = { name: rule.name, enabled: rule.enabled, sourceType: rule.sourceType, collectionId: rule.collectionId, collectionTitle: rule.collectionTitle, vendor: rule.vendor, productId: rule.productId, productTitle: rule.productTitle, collections: rule.collections as Prisma.InputJsonValue, vendors: rule.vendors as Prisma.InputJsonValue, products: rule.products as Prisma.InputJsonValue, position: rulePosition };
      const savedRule = ruleIds.has(rule.id)
        ? await tx.productFinderRuleSet.update({ where: { id: ruleIds.get(rule.id)! }, data: ruleValues })
        : await tx.productFinderRuleSet.create({ data: { ...ruleValues, key: rule.id, finderId: finder.id } });

      await tx.productFinderQuestion.deleteMany({ where: { ruleSetId: savedRule.id, key: { notIn: rule.questions.map((question) => question.id) } } });
      for (const [position, question] of rule.questions.entries()) {
        const values = { question: question.question, templateQuestionId: question.templateQuestionId || null, mappingType: question.mappingType || null, fieldKey: question.fieldKey || null, required: Boolean(question.required), selectionMode: question.selectionMode === "multiple" ? "multiple" : "single", enabled: question.enabled, position, finderId: finder.id, ruleSetId: savedRule.id };
        const savedQuestion = questionIds.has(question.id)
          ? await tx.productFinderQuestion.update({ where: { id: questionIds.get(question.id)! }, data: values })
          : await tx.productFinderQuestion.create({ data: { ...values, key: question.id } });

        await tx.productFinderAnswer.deleteMany({ where: { questionId: savedQuestion.id, key: { notIn: question.answers.map((answer) => answer.id) } } });
        for (const [answerPosition, answer] of question.answers.entries()) {
          const { id: key, ...answerValues } = answer;
          const existingAnswer = answers.find((item) => item.key === key);
          if (existingAnswer) await tx.productFinderAnswer.update({ where: { id: existingAnswer.id }, data: { ...answerValues, position: answerPosition } });
          else await tx.productFinderAnswer.create({ data: { key, questionId: savedQuestion.id, ...answerValues, position: answerPosition } });
        }
      }
    }
    return draft(await tx.productFinder.findUniqueOrThrow({ where: { id: finder.id }, include }));
  }, { timeout: 30_000 });
}

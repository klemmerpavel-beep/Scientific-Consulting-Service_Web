-- Рекомендации принимаются и отклоняются (замечание владельца 08.10.2026,
-- решение Р-491): к «сделано» и «отложено» добавлены «принято» и «отклонено».
ALTER TYPE "RecommendationMarkStatus" ADD VALUE 'ACCEPTED';
ALTER TYPE "RecommendationMarkStatus" ADD VALUE 'DECLINED';

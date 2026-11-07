# Как включить автоматическую публикацию настоящих изображений

В GitHub Actions теперь есть отдельный workflow генерации растровых WEBP-плакатов. Он запускается каждый час, но по умолчанию отключён от платных запросов.

**Важно:** OpenAI API оплачивается отдельно от подписки ChatGPT. Автоматическое списание не включается без явного действия пользователя.

1. Откройте GitHub → Settings → Secrets and variables → Actions.
2. Создайте repository secret OPENAI_API_KEY.
3. Создайте repository variable ENABLE_PAID_IMAGE_GENERATION со значением true.
4. По желанию укажите IMAGE_BATCH_SIZE (1–20, по умолчанию 12).
5. Actions → Generate real Russian lesson illustrations using paid API → Run workflow.

Файлы будут появляться в presentation_database/illustrated_raster. Старые изображения не заменяются, прогресс записывается по реально созданным файлам. Сгенерированные правила и школьные обозначения необходимо проверить перед использованием.

Документация: https://platform.openai.com/docs/guides/image-generation

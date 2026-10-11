/**
 * Демонстрационный каталог.
 *
 * Это резервный источник: он используется, если настоящая Google Таблица
 * ещё не подключена или недоступна. Данные хранятся в формате CSV —
 * ровно таком же, как опубликованный лист Google Таблицы,
 * чтобы сайт обрабатывал их одинаковым кодом.
 */

export const DEMO_CATALOG_CSV = `ID,Тип,Название,Цена,Изображение,Активен
sofa2,furniture,Двухместный диван,2500,/images/item-sofa-two.webp,да
corner,furniture,Угловой диван,4200,/images/item-sofa-corner.webp,да
chair,furniture,Кресло,1200,/images/item-armchair.webp,да
mattress,furniture,Матрас,1800,/images/item-mattress.webp,да
stains,service,Удаление сложных пятен,500,,да
odor,service,Устранение запахов,300,,да
`;

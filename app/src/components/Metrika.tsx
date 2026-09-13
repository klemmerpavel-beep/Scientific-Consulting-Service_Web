import Script from 'next/script';

/**
 * Счётчик посещаемости.
 *
 * Выключен, пока не задан номер: без `NEXT_PUBLIC_METRIKA_ID` компонент не
 * отдаёт ничего, ни одного внешнего запроса со страницы не уходит. Номер
 * читается при сборке, как и остальные `NEXT_PUBLIC_*`, поэтому включение —
 * это пересборка образа, а не перезапуск контейнера.
 *
 * Вебвизор, запись движений курсора и копирование форм НЕ включаются
 * намеренно. Вебвизор пишет содержимое полей, то есть имя, телефон и тему
 * работы, и отправляет их третьему лицу. Это отдельная передача
 * персональных данных, для которой нужны своё основание в политике и своя
 * строка в уведомлении Роскомнадзора; ради сведений о посещаемости такая
 * цена не платится.
 *
 * Перед включением обязательна новая редакция политики. Её раздел «Файлы
 * cookies и веб-аналитика» сейчас утверждает три вещи, каждая из которых
 * перестанет быть верной: сайт не использует cookies, сервисы веб-аналитики
 * не используются, сведения о посетителях счётчиком не собираются. Счётчик
 * ставит cookies и передаёт данные третьему лицу, поэтому включение без
 * правки этого раздела делает политику недостоверной — а её достоверность
 * проверяется первой при обращении в Роскомнадзор.
 */
const METRIKA_ID = process.env.NEXT_PUBLIC_METRIKA_ID;

export default function Metrika() {
  if (!METRIKA_ID) return null;

  return (
    <>
      <Script id="pd-metrika" strategy="afterInteractive">
        {`(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
m[i].l=1*new Date();for(var j=0;j<e.scripts.length;j++){if(e.scripts[j].src===r){return}}
k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");
ym(${Number(METRIKA_ID)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:false});`}
      </Script>
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${Number(METRIKA_ID)}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}

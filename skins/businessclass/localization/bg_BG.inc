<?php

/**
 * Bulgarian translation of the strings the BusinessClass skin adds.
 *
 * rcube::read_localization() always loads en_US.inc first and then the session
 * language over it, so a key missing here falls back to English rather than to
 * its own name. `npm run lint:labels` still requires the whole set, because a
 * half-translated pane is worse than a consistently English one.
 *
 * Terminology follows Roundcube's own bg_BG catalogue where core has the word:
 * "Търсене" for search, "Група" for group, "Използвано място" for quota.
 */

$labels = [];

// About (§4.4)
$labels['bc_by'] = 'от';

// Folder pane (§3.4) / categories (§8)
$labels['bc_labels'] = 'Етикети';
$labels['bc_favorites'] = 'Любими';

// The ribbon (D-75)
$labels['bc_ribbontabs'] = 'Лента';
$labels['bc_tabhome'] = 'Начало';
// Not core's 'newmessage' ("Compose"): the ribbon's primary button is worded
// the way Outlook words it, and core's label is used elsewhere unchanged.
$labels['bc_newemail'] = 'Ново писмо';
$labels['bc_tabview'] = 'Изглед';
$labels['bc_tabhelp'] = 'Помощ';
$labels['bc_togglefolders'] = 'Показване или скриване на папките';
$labels['bc_togglebooks'] = 'Показване или скриване на адресните книги';
$labels['bc_togglesections'] = 'Показване или скриване на разделите';

// View tab (D-76)
$labels['bc_viewsettings'] = 'Настройки на изгледа';
$labels['bc_vmessages'] = 'Съобщения';
$labels['bc_vconversations'] = 'Разговори';
$labels['bc_vgrouped'] = 'Групиране по разговор';
$labels['bc_vungrouped'] = 'Без групиране';
$labels['bc_vpreview'] = 'Преглед на съобщението';
$labels['bc_voff'] = 'Изключено';
$labels['bc_v1line'] = '1 ред';
$labels['bc_v2lines'] = '2 реда';
$labels['bc_vexpand'] = 'Разгъване на разговора';
$labels['bc_folderpane'] = 'Панел с папки';
$labels['bc_vshow'] = 'Показване';
$labels['bc_vhide'] = 'Скриване';
$labels['bc_addfavorite'] = 'Добавяне в Любими';
$labels['bc_removefavorite'] = 'Премахване от Любими';

// App header (§3.2)
$labels['bc_appmenu'] = 'Меню с приложения';
$labels['bc_support'] = 'Помощ';
$labels['bc_website'] = 'уебсайт';
$labels['bc_account'] = 'Профил';

// Panes (§3.1)
$labels['bc_resizefolders'] = 'Преоразмеряване на панела с папките';
$labels['bc_resizelist'] = 'Преоразмеряване на списъка с писма';

// Message list date groups (§3.5)
$labels['bc_yesterday'] = 'Вчера';
$labels['bc_thisweek'] = 'Тази седмица';
$labels['bc_lastweek'] = 'Миналата седмица';
$labels['bc_thismonth'] = 'Този месец';
$labels['bc_older'] = 'По-стари';

// Message list toolbar (§3.5)
$labels['bc_selectnone'] = 'Изчистване на избора';
$labels['bc_quickactions'] = 'Действия с писмото';
$labels['bc_thread'] = 'Писма в разговора';

// Density (§3.5)
$labels['bc_density'] = 'Плътност на редовете';
$labels['bc_comfortable'] = 'Свободна';
$labels['bc_compact'] = 'Компактна';

// Reading pane (§3.5)
$labels['bc_readingpane'] = 'Панел за четене';
$labels['bc_paneright'] = 'Отдясно';
$labels['bc_panebottom'] = 'Отдолу';
$labels['bc_paneoff'] = 'Изключен';

// Sort split-button (§3.5)
$labels['bc_sortascending'] = 'Възходящо';
$labels['bc_sortdescending'] = 'Низходящо';
$labels['bc_sortoptions'] = 'Настройки на подреждането';

// Focused / Other (§7.4)
$labels['bc_focused'] = 'Приоритетни';
$labels['bc_other'] = 'Други';
$labels['bc_focusedtabs'] = 'Обхват на входящата поща';

// Hover quick actions (§3.5, §7.5)
$labels['bc_quickarchive'] = 'Архивиране';
$labels['bc_quickdelete'] = 'Изтриване';
$labels['bc_quickflag'] = 'Отбелязване';
$labels['bc_quickunflag'] = 'Премахване на отметката';
$labels['bc_quickpin'] = 'Закачане';
$labels['bc_quickunpin'] = 'Откачане';

// Threading (§3.5)
$labels['bc_expandthread'] = 'Разгъване на разговора';
$labels['bc_collapsethread'] = 'Сгъване на разговора';

// Compose (§4.1)
$labels['bc_addrecipients'] = 'Добавяне на получатели…';
$labels['bc_removerecipient'] = 'Премахване на получателя';
$labels['bc_dropfiles'] = 'Пуснете файлове, за да ги прикачите';
$labels['bc_emoji'] = 'Емоджи';
// $time is substituted client-side.
$labels['bc_draftsaved'] = 'Черновата е запазена в $time';
$labels['bc_discardconfirm'] = 'Да се откаже ли писмото и да се изтрие запазената чернова?';

// Login (§4.2)
$labels['bc_showpassword'] = 'Показване на паролата';
$labels['bc_hidepassword'] = 'Скриване на паролата';
$labels['bc_forgotpassword'] = 'Забравена парола?';

// Search + refine (§4.3)
$labels['bc_filters'] = 'Филтри';
$labels['bc_refine'] = 'Уточняване';
$labels['bc_onlyshow'] = 'Показване само на';
$labels['bc_removefilter'] = 'Премахване на филтъра';
// $count and $scope are substituted client-side.
$labels['bc_resultsin'] = '$count резултата в $scope';
$labels['bc_searchfrom'] = 'От';
$labels['bc_searchto'] = 'До';
$labels['bc_searchcc'] = 'Копие';
$labels['bc_searchbcc'] = 'Скрито копие';
$labels['bc_searchsubject'] = 'Тема';
$labels['bc_searchbody'] = 'Съдържание';
$labels['bc_searchhas'] = 'Съдържа';
$labels['bc_searchis'] = 'Състояние';

// Empty states (§12 step 8)
$labels['bc_nomessages'] = 'Тук няма нищо';
$labels['bc_noresults'] = 'Няма съвпадения';
$labels['bc_noresultstext'] = 'Опитайте с други думи или разширете обхвата от „Филтри“.';
$labels['bc_nomessageselected'] = 'Няма избрано писмо';
$labels['bc_pickmessage'] = 'Изберете писмо от списъка, за да го прочетете тук.';
$labels['bc_back'] = 'Назад';

// Settings (§4.4)
$labels['bc_nosectionselected'] = 'Няма избран раздел';
$labels['bc_picksection'] = 'Изберете раздел от настройките, за да видите опциите му.';
$labels['bc_nofolderselected'] = 'Няма избрана папка';
$labels['bc_pickfolder'] = 'Изберете папка, за да я преименувате, преместите или изпразните.';
$labels['bc_noidentityselected'] = 'Няма избрана самоличност';
$labels['bc_pickidentity'] = 'Изберете самоличност, за да редактирате името, адреса и подписа, с които изпращате.';
$labels['bc_noresponseselected'] = 'Няма избран шаблон';
$labels['bc_pickresponse'] = 'Изберете готов отговор, за да редактирате текста му.';
$labels['bc_nofilterselected'] = 'Няма избран филтър';
$labels['bc_pickfilter'] = 'Изберете филтър, за да редактирате условията и действията му.';
$labels['bc_changesdiscarded'] = 'Промените са отменени';
$labels['bc_dragfolder'] = 'Плъзнете, за да преместите папката';
$labels['bc_subscribed'] = 'Абонирана';
$labels['bc_filterenabled'] = 'Филтърът е включен';
$labels['bc_filterdisabled'] = 'Филтърът е изключен';

// Contacts (§4.5)
$labels['bc_addressbooks'] = 'Адресни книги';
$labels['bc_nocontactselected'] = 'Няма избран контакт';
$labels['bc_pickcontact'] = 'Изберете контакт, за да видите данните му.';
$labels['bc_nocontacts'] = 'Все още няма контакти';

// Identity photo (§7.10)
$labels['bc_photo'] = 'Снимка';
$labels['bc_photoupload'] = 'Качване на снимка';
$labels['bc_photoremove'] = 'Премахване на снимката';
$labels['bc_photohint'] = 'Показва се до името ви в пощата. Записва се във вашия собствен контакт, така че не се изпраща с писмата ви.';
$labels['bc_photoaftersave'] = 'Първо запишете самоличността, след това към нея може да се добави снимка.';
$labels['bc_photouploading'] = 'Снимката се записва…';
$labels['bc_photoinvalid'] = 'Този файл не е изображение, което пощата може да използва.';
$labels['bc_photoconfirmremove'] = 'Да се премахне ли снимката от тази самоличност?';

// Plugin screens (§12 step 11)
$labels['bc_nokeyselected'] = 'Няма избран ключ';
$labels['bc_pickkey'] = 'Изберете ключ, за да видите данните му.';

// The message-body sheet toggle in the reading pane (§12 step 12, D-68). Two
// keys because the button names the ACTION it will perform, not the state it is
// in — a toggle titled with its current state is the classic ambiguity.
$labels['bc_sheetlight'] = 'Показване на съобщението на светъл фон';
$labels['bc_sheetdark'] = 'Показване на съобщението на тъмен фон';

// Бързи клавиши (§9, стъпка 14)
$labels['bc_keystitle'] = 'Бързи клавиши';
$labels['bc_keysnote'] = 'Бързите клавиши никога не се задействат, докато пишете в текстово поле. Могат да се изключат от Настройки › Предпочитания › Потребителски интерфейс.';
$labels['bc_keyslist'] = 'В списъка със съобщения';
$labels['bc_keysmessage'] = 'Върху избраното съобщение';
$labels['bc_keysapp'] = 'Навсякъде';
$labels['bc_keyenter'] = 'Enter';
$labels['bc_keynext'] = 'Следващо съобщение';
$labels['bc_keyprev'] = 'Предишно съобщение';
$labels['bc_keyopen'] = 'Отваряне';
$labels['bc_keyselect'] = 'Добавяне към или премахване от избраното';
$labels['bc_keyrowmenu'] = 'Отваряне на менюто с действия';
$labels['bc_keyarchive'] = 'Архивиране';
$labels['bc_keydelete'] = 'Изтриване';
$labels['bc_keyunread'] = 'Отбелязване като непрочетено';
$labels['bc_keyflag'] = 'Поставяне или махане на флаг';
$labels['bc_keyreply'] = 'Отговор';
$labels['bc_keyreplyall'] = 'Отговор до всички';
$labels['bc_keycompose'] = 'Ново съобщение';
$labels['bc_keysearch'] = 'Търсене';
$labels['bc_keypanes'] = 'Към следващия панел';
$labels['bc_keyhelp'] = 'Показване на този списък';
$labels['bc_oneselected'] = 'Избрано е 1 съобщение';
$labels['bc_nselected'] = 'Избрани са $n съобщения';
$labels['bc_newmail'] = 'Пристигна нова поща.';

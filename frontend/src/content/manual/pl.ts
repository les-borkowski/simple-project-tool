import type { ManualContent } from './types'

/**
 * Polish translation of the manual.
 *
 * Section `id`s are identical to en-GB on purpose — they are anchors, not copy, so deep
 * links and the scroll-spy keep working across a language change.
 *
 * Literal UI labels are left in English where the interface itself shows them in English
 * only (command names, scopes, CLI flags). Translating those would send the reader
 * looking for a button that does not exist.
 */
export const manualPl: ManualContent = {
  title: 'Podręcznik użytkownika',
  subtitle: 'Jak działa Simple Project Tool, od początku do końca.',
  contentsLabel: 'Spis treści',
  notice: {
    t: 'callout',
    kind: 'note',
    label: 'Tłumaczenie automatyczne',
    text: 'To tłumaczenie zostało wygenerowane automatycznie i nie zostało jeszcze sprawdzone przez native speakera. W razie wątpliwości rozstrzygająca jest wersja angielska.',
  },
  sections: [
    {
      id: 'getting-started',
      label: 'Pierwsze kroki',
      heading: 'Pierwsze kroki',
      blocks: [
        { t: 'h3', text: 'Załóż konto' },
        {
          t: 'ol',
          items: [
            'Otwórz aplikację i wybierz **Zarejestruj się**.',
            'Podaj imię i nazwisko, adres e-mail oraz hasło (dwukrotnie — formularz sprawdza zgodność przed wysłaniem).',
            'Zobaczysz ekran **Sprawdź pocztę**. Wysyłamy link potwierdzający na podany adres.',
            'Kliknij link. Po potwierdzeniu konto jest aktywne i możesz się zalogować.',
          ],
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Nie dotarł e-mail?',
          text: 'Na ekranie potwierdzenia jest przycisk **Wyślij ponownie e-mail potwierdzający**. Jeśli spróbujesz zalogować się przed potwierdzeniem, zobaczysz _„Potwierdź swój adres e-mail przed zalogowaniem.”_ — to ta sama sytuacja, a nie błędne hasło.',
        },
        { t: 'h3', text: 'Logowanie' },
        {
          t: 'p',
          text: 'Podaj e-mail i hasło na ekranie logowania. Pozostaniesz zalogowany w tej przeglądarce do czasu wylogowania.',
        },
        { t: 'h3', text: 'Zapomniane hasło' },
        {
          t: 'ol',
          items: [
            'Wybierz **Nie pamiętasz hasła?** obok pola hasła na ekranie logowania.',
            'Podaj adres e-mail i wybierz **Wyślij link resetujący**.',
            'Otwórz link z otrzymanej wiadomości. Przeniesie Cię na stronę **Zresetuj hasło**, gdzie ustawisz nowe.',
            'Zaloguj się nowym hasłem.',
          ],
        },
        {
          t: 'p',
          text: 'Linki resetujące wygasają. Wygasły lub już użyty link pokaże _„Ten link jest nieprawidłowy lub wygasł.”_ — poproś o nowy zamiast ponawiać próbę ze starej wiadomości.',
        },
        {
          t: 'p',
          text: 'E-maile resetujące są też ograniczane: jeśli poprosisz o kilka pod rząd, wyślemy tylko pierwszy — sprawdź skrzynkę przed kolejną próbą.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Dlaczego potwierdzenie jest ogólnikowe',
          text: 'Po wysłaniu aplikacja informuje, że link został wysłany, _jeśli ten adres jest zarejestrowany_ — nie potwierdza ani nie zaprzecza. To celowe: strona mówiąca „nie ma takiego konta” pozwoliłaby każdemu sprawdzać, które adresy mają tu konta.',
        },
        { t: 'h3', text: 'Zmiana hasła później' },
        { t: 'path', text: 'Ustawienia → Ustawienia aplikacji → Bezpieczeństwo' },
        {
          t: 'p',
          text: 'Podaj bieżące hasło, a następnie dwukrotnie nowe. Po udanej zmianie zapytamy, czy **Pozostać zalogowanym**, czy **Wylogować się** — wylogowanie jest bezpieczniejsze, jeśli podejrzewasz, że ktoś znał stare hasło.',
        },
      ],
    },
    {
      id: 'getting-around',
      label: 'Poruszanie się',
      heading: 'Poruszanie się po aplikacji',
      blocks: [
        { t: 'h3', text: 'Panel boczny' },
        {
          t: 'p',
          text: 'Panel boczny to główna nawigacja, dostępna na każdej stronie:',
        },
        {
          t: 'ul',
          items: [
            '**Ostatnia aktywność** — projekty, historyjki i zadania, których dotykałeś ostatnio, żeby wrócić do pracy bez szukania.',
            '**Projekty** — Twoje projekty, ze skrótem **+** do utworzenia nowego i odnośnikiem **Wszystkie projekty**, gdy lista nie mieści się w panelu.',
            '**Zaproszenia** — zaproszenia do projektów czekające na Ciebie. Obok pojawia się liczba, gdy coś oczekuje.',
            '**Pomoc** i **Ustawienia** — na dole, razem z menu konta i **Wyloguj**.',
          ],
        },
        {
          t: 'p',
          text: 'Na wąskim ekranie panel zwija się do przycisku menu na górnym pasku; dotknij go, aby wysunąć tę samą nawigację jako szufladę.',
        },
        { t: 'h3', text: 'Wyszukiwanie' },
        {
          t: 'p',
          text: 'Pole wyszukiwania u góry panelu przeszukuje jednocześnie projekty, historyjki i zadania. Wyniki są pogrupowane według typu, a pełną stronę **Wyniki wyszukiwania** otworzysz, aby zobaczyć wszystko, a nie tylko najlepsze trafienia.',
        },
        { t: 'h3', text: 'Paleta poleceń' },
        {
          t: 'p',
          text: 'Naciśnij [[⌘K]] (lub [[Ctrl K]] w Windows i Linux) w dowolnym miejscu, aby otworzyć paletę poleceń. Zacznij pisać, aby wyszukać, albo wybierz szybką akcję:',
        },
        {
          t: 'ul',
          items: [
            'Nowy projekt, nowa historyjka, nowe zadanie',
            'Zaproś członka',
            'Otwórz ustawienia, otwórz ten podręcznik',
            'Przełącz tryb jasny / ciemny',
          ],
        },
        {
          t: 'p',
          text: 'Poruszaj się po wynikach klawiszami [[↑]] i [[↓]], otwieraj klawiszem [[Enter]], a paletę zamkniesz klawiszem [[Esc]].',
        },
        {
          t: 'callout',
          kind: 'tip',
          label: 'Wskazówka',
          text: 'Paleta działa również z poziomu menu mobilnego — naciśnięcie [[⌘K]] zamyka szufladę i otwiera paletę w jej miejscu. Nie zadziała, gdy otwarte jest okno dialogowe, więc najpierw dokończ lub anuluj to, co robisz.',
        },
        { t: 'h3', text: 'Ścieżka nawigacji' },
        {
          t: 'p',
          text: 'Strony szczegółów pokazują ścieżkę, którą do nich dotarłeś — projekt → historyjka → zadanie — więc wrócisz poziom wyżej jednym kliknięciem. Na wąskich ekranach ścieżka jest skrócona; dotknij jej, aby pokazać pełną.',
        },
      ],
    },
    {
      id: 'projects',
      label: 'Projekty',
      heading: 'Projekty',
      blocks: [
        {
          t: 'p',
          text: 'Projekt to nadrzędny pojemnik na pracę. Zawiera historyjki, zadania, członków, sprinty i własny przepływ statusów.',
        },
        { t: 'h3', text: 'Tworzenie projektu' },
        {
          t: 'p',
          text: 'Użyj **Nowy projekt** na stronie Projekty, przycisku **+** w panelu bocznym albo palety poleceń. Projekt wymaga nazwy; opis jest opcjonalny i można go uzupełnić później.',
        },
        { t: 'h3', text: 'Archiwizacja i usuwanie' },
        { t: 'p', text: 'Otwórz projekt i użyj menu **⋯** w jego nagłówku:' },
        {
          t: 'ul',
          items: [
            '**Archiwizuj** ukrywa projekt z domyślnej listy, nic nie tracąc. Zaznacz **Pokaż zarchiwizowane** na stronie Projekty, aby je zobaczyć, a potem **Przywróć**, aby wrócić.',
            '**Usuń** trwale usuwa projekt i najpierw prosi o potwierdzenie.',
          ],
        },
        {
          t: 'p',
          text: 'Obie akcje są dostępne tylko dla Menedżera — zobacz [Członkowie i role](#members).',
        },
        { t: 'h3', text: 'Karty projektu' },
        { t: 'p', text: 'Wewnątrz projektu pasek kart przełącza widoki:' },
        {
          t: 'table',
          head: ['Karta', 'Co pokazuje'],
          rows: [
            ['**Tablica**', 'Każde zadanie w projekcie jako karta w kolumnach statusów'],
            ['**Historyjki**', 'Historyjki projektu jako sortowalna, filtrowalna tabela'],
            ['**Sprinty**', 'Sprinty ograniczone czasowo i przypisane do nich zadania'],
            ['**Oś czasu**', 'Widok w stylu Gantta: zadania na osi dat'],
            ['**Członkowie**', 'Kto ma dostęp do projektu i w jakiej roli'],
            ['**Ustawienia**', 'Które karty są widoczne i w jakiej kolejności'],
          ],
        },
        {
          t: 'p',
          text: 'Możesz ukryć nieużywane karty i przeciągnąć pozostałe w wybranej kolejności — zobacz [Ustawienia](#settings). Sama karta **Ustawienia** jest zawsze ostatnia i nie da się jej ukryć, bo to właśnie tam przywraca się ukrytą kartę.',
        },
      ],
    },
    {
      id: 'board',
      label: 'Tablica',
      heading: 'Tablica',
      blocks: [
        {
          t: 'p',
          text: 'Tablica pokazuje każde zadanie w projekcie jako kartę, ułożoną w kolumnach. **Kolumny to własne statusy projektu** — jeśli je dostosowałeś, tablica podąża za nimi.',
        },
        { t: 'h3', text: 'Przesuwanie pracy' },
        {
          t: 'p',
          text: 'Przeciągnij kartę do innej kolumny, aby zmienić status. Zmiana zapisuje się natychmiast i trafia do historii statusów zadania. Status zmienisz też ze strony samego zadania lub z kontrolki na karcie.',
        },
        { t: 'h3', text: 'Filtrowanie i sortowanie' },
        {
          t: 'p',
          text: 'Pasek narzędzi tablicy zawęża to, co widać. Filtruj według **statusu**, **priorytetu**, **przypisanej osoby** lub **historyjki** i szukaj po tytule. Liczby zadań i zadań ukończonych aktualizują się na bieżąco, więc postęp odczytasz wprost z paska. Gdy nic nie pasuje, zobaczysz _„Brak wyników pasujących do filtrów”_, a nie pustą tablicę, którą można wziąć za pusty projekt.',
        },
        {
          t: 'p',
          text: 'Karta Historyjki ma własne odpowiedniki tych kontrolek — wyszukiwanie po tytule, filtrowanie po statusie i priorytecie oraz sortowanie po dacie utworzenia, statusie, priorytecie lub tytule, w obu kierunkach.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Warto wiedzieć',
          text: 'Zadania należące do historyjki, która jest już _Gotowe_, znikają z tablicy, żeby ukończona historyjka nie zaśmiecała bieżącej pracy. Otwórz samą historyjkę, aby je zobaczyć.',
        },
        { t: 'h3', text: 'Tworzenie z tablicy' },
        {
          t: 'p',
          text: 'Przycisk **Nowy** w nagłówku projektu tworzy **Historyjkę**, **Zadanie** albo otwiera **Szybkie dodawanie**, aby zapisać kilka zadań zwykłym językiem naraz. Obok jest przycisk **Zaproś** do dodawania osób.',
        },
      ],
    },
    {
      id: 'stories',
      label: 'Historyjki',
      heading: 'Historyjki',
      blocks: [
        {
          t: 'p',
          text: 'Historyjka grupuje powiązane zadania w projekcie — funkcję, obszar pracy, fragment wydania. Jak projekty i zadania, historyjka ma własny status, priorytet, opis, komentarze i historię.',
        },
        { t: 'h3', text: 'Historyjka Zaległości' },
        {
          t: 'p',
          text: 'Każdy projekt powstaje z domyślną historyjką **Zaległości**. Zadania tworzone na poziomie projektu — a nie wewnątrz konkretnej historyjki — trafiają tam automatycznie; dlatego tablica może pokazać wszystkie zadania projektu i żadne nie zostaje bez przypisania. Zaległości zawsze sortują się na koniec listy historyjek.',
        },
        { t: 'h3', text: 'Praca z historyjką' },
        {
          t: 'p',
          text: 'Otwórz historyjkę, aby zobaczyć jej stronę szczegółów: opis, status, priorytet, zadania, komentarze i historię statusów. Zmiany zapisują się na bieżąco i potwierdzają krótkim powiadomieniem — nie musisz szukać przycisku Zapisz.',
        },
        {
          t: 'p',
          text: 'Przenoszenie zadania między historyjkami odbywa się z poziomu zadania, nie historyjki — patrz niżej.',
        },
      ],
    },
    {
      id: 'tasks',
      label: 'Zadania',
      heading: 'Zadania',
      blocks: [
        {
          t: 'p',
          text: 'Zadania to jednostka właściwej pracy. Utwórz je przez **Nowy → Zadanie**, z palety poleceń albo przez [Szybkie dodawanie](#capture).',
        },
        { t: 'h3', text: 'Co zawiera zadanie' },
        {
          t: 'table',
          head: ['Pole', 'Uwagi'],
          rows: [
            ['**Tytuł**', 'Edytowalny w miejscu na stronie zadania.'],
            [
              '**Status**',
              'Jeden ze statusów projektu. Każda zmiana jest rejestrowana — zobacz [Historia statusów](#history).',
            ],
            ['**Priorytet**', 'Niski, Średni lub Wysoki.'],
            ['**Przypisany**', 'Dowolny członek projektu albo Nieprzypisane.'],
            [
              '**Historyjka**',
              'Do której historyjki należy zadanie. Zmień tutaj, aby przenieść zadanie.',
            ],
            ['**Sprint**', 'Do którego sprintu jest zaplanowane, jeśli w ogóle.'],
            [
              '**Wysiłek**',
              'Liczba całkowita w jednostce wybranej dla projektu. Pojawia się tylko wtedy, gdy projekt ma włączone śledzenie wysiłku.',
            ],
            ['**Opis**', 'Dowolny tekst z obsługą markdown.'],
          ],
        },
        {
          t: 'p',
          text: 'Każde pole zapisuje się w chwili zmiany i potwierdza powiadomieniem. Strona zadania zawiera też jego komentarze i historię statusów.',
        },
        { t: 'h3', text: 'Usuwanie zadania' },
        {
          t: 'p',
          text: 'Usuwanie to akcja Menedżera i wymaga potwierdzenia. Nie da się jej cofnąć — jeśli chcesz tylko uprzątnąć zadanie z widoku, przenieś je do statusu _Gotowe_.',
        },
      ],
    },
    {
      id: 'comments',
      label: 'Komentarze',
      heading: 'Komentarze',
      blocks: [
        {
          t: 'p',
          text: 'Projekty, historyjki i zadania mają własne wątki komentarzy, na stronie szczegółów danego elementu. Komentarze obsługują **markdown**, więc możesz używać list, odnośników, wyróżnień i formatowania kodu.',
        },
        {
          t: 'p',
          text: 'Napisz w polu, a potem **Dodaj**. Komentować mogą zarówno Współpracownicy, jak i Menedżerowie — komentowanie celowo nie jest akcją uprzywilejowaną, bo tak właśnie toczy się większość dyskusji.',
        },
      ],
    },
    {
      id: 'history',
      label: 'Historia statusów i czas',
      heading: 'Historia statusów i czas',
      blocks: [
        {
          t: 'p',
          text: 'Każda zmiana statusu projektu, historyjki lub zadania jest dopisywana do trwałego rejestru. Nic nie nadpisuje ani nie usuwa wcześniejszego wpisu, więc historia jest prawdziwym śladem audytowym, a nie podsumowaniem, które może się rozjechać.',
        },
        {
          t: 'p',
          text: 'Panel **Historia statusów** na stronie historyjki lub zadania pokazuje dla każdej zmiany:',
        },
        {
          t: 'ul',
          items: [
            'z jakiego statusu na jaki nastąpiła zmiana,',
            'kto jej dokonał,',
            'oraz jak długo element pozostawał w poprzednim statusie — wartość **Czas w statusie**.',
          ],
        },
        {
          t: 'p',
          text: 'Ponieważ ślad jest kompletny, czas jest obliczany, a nie szacowany. Dzięki temu łatwo dostrzec, gdzie praca faktycznie stoi: zadanie, które spędziło osiem dni _W przeglądzie_, widać wprost, nawet jeśli po zajęciu się nim zostało skończone szybko.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Raporty zbiorcze',
          text: 'Zestawienia dla całego projektu lub całej osoby — łączny czas według statusu, projektu czy użytkownika — są dostępne przez CLI i API, a nie w interfejsie webowym. Zobacz [Dla zaawansowanych](#power).',
        },
      ],
    },
    {
      id: 'sprints',
      label: 'Sprinty',
      heading: 'Sprinty',
      blocks: [
        {
          t: 'p',
          text: 'Sprint to nazwany, ograniczony czasowo blok pracy z datą początku i końca. Karta **Sprinty** pokazuje każdy sprint obok kolumny **Nieprzypisane zadania**.',
        },
        { t: 'h3', text: 'Tworzenie i edycja' },
        {
          t: 'p',
          text: 'Użyj **Nowy sprint** i nadaj mu nazwę, datę początku i datę końca. **Pojemność** jest opcjonalna. Nazwę, daty i pojemność można później edytować z menu sprintu, a każda zmiana potwierdza się powiadomieniem.',
        },
        { t: 'h3', text: 'Przypisywanie zadań' },
        { t: 'p', text: 'Dwa sposoby, jak wygodniej:' },
        {
          t: 'ul',
          items: [
            '**Przeciągnij** kartę zadania na kolumnę sprintu. Miejsce upuszczenia podświetla się przy najechaniu.',
            'Użyj menu **Przypisz do sprintu** na karcie; oferuje też **Bez sprintu**, aby wycofać zadanie.',
          ],
        },
        { t: 'h3', text: 'Pojemność i wysiłek' },
        {
          t: 'p',
          text: 'Gdy projekt ma włączone śledzenie wysiłku, każda karta pokazuje swój wysiłek, a nagłówek sprintu pokazuje **wykorzystano / pojemność**. Jeśli przypisany wysiłek przekracza ustawioną pojemność, sprint jest oznaczany jako **Przekroczona pojemność** — to sygnał, by coś przenieść, a nie twarda blokada. Sprinty bez ustawionej pojemności po prostu nie pokazują porównania.',
        },
        {
          t: 'p',
          text: 'Śledzenie wysiłku jest domyślnie wyłączone i włącza się je per projekt — zobacz [Ustawienia](#settings).',
        },
      ],
    },
    {
      id: 'timeline',
      label: 'Oś czasu',
      heading: 'Oś czasu',
      blocks: [
        {
          t: 'p',
          text: 'Karta **Oś czasu** układa zadania jako poziome paski na tle kalendarza, pogrupowane według sprintów, a zadania spoza sprintów pokazuje na końcu. Wybierz pasek, aby zobaczyć szczegóły zadania.',
        },
        { t: 'h3', text: 'Skąd biorą się daty paska' },
        {
          t: 'p',
          text: 'Zadanie nie musi mieć wypełnionego pola daty, żeby się pojawić. Oś czasu wyznacza najlepszy dostępny zakres w tej kolejności:',
        },
        {
          t: 'table',
          head: ['Etykieta', 'Używane gdy', 'Pasek obejmuje'],
          rows: [
            [
              '**Termin**',
              'Zadanie ma termin wykonania',
              'Od pierwszej zmiany statusu (lub daty utworzenia, jeśli status nigdy się nie zmienił) do terminu',
            ],
            [
              '**Sprint**',
              'Brak terminu, ale zadanie jest w sprincie',
              'Daty początku i końca sprintu',
            ],
            [
              '**Historia statusów**',
              'Żadne z powyższych',
              'Od pierwszej zmiany statusu zadania do najnowszej',
            ],
          ],
        },
        {
          t: 'p',
          text: 'Każdy pasek jest opisany tym, którego z trzech źródeł użyto, więc od razu odróżnisz prawdziwy termin od zakresu wywnioskowanego.',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Duże projekty',
          text: 'Oś czasu rysuje najwyżej **500 zadań**. Powyżej tej liczby zobaczysz ostrzeżenie, że pokazano tylko pierwsze 500 — pozostałe widoki nie mają takiego ograniczenia.',
        },
      ],
    },
    {
      id: 'capture',
      label: 'Szybkie dodawanie',
      heading: 'Szybkie dodawanie',
      blocks: [
        {
          t: 'p',
          text: 'Szybkie dodawanie zamienia zdanie w uporządkowane zadania. Napisz np. _„poproś Annę o przegląd ścieżki zakupowej do piątku, i ktoś musi zaktualizować stronę cennika”_, a system zaproponuje zadania z wypełnionymi tytułami, terminami, przypisaniami, historyjkami i priorytetami.',
        },
        { t: 'p', text: 'Otwórz je z **Nowy → Szybkie dodawanie** w nagłówku projektu.' },
        { t: 'h3', text: 'Jak to działa' },
        {
          t: 'ol',
          items: [
            'Opisz pracę własnymi słowami — jedno zadanie lub kilka.',
            'Wybierz **Podgląd zadań**. Nic jeszcze nie powstaje.',
            'Przejrzyj zaproponowane zadania. Każde pole można edytować, a każde zadanie ma pole wyboru.',
            'Zatwierdź. Powstaną tylko zaznaczone zadania — wszystkie naraz albo żadne.',
          ],
        },
        {
          t: 'callout',
          kind: 'tip',
          label: 'Nic nie powstaje bez Ciebie',
          text: 'Krok podglądu niczego nie zapisuje. Zadania powstają dopiero po zatwierdzeniu, więc możesz podglądać dowolnie wiele razy, dopracowując treść.',
        },
        { t: 'h3', text: 'Niska pewność' },
        {
          t: 'p',
          text: 'Gdy ekstrakcja nie jest pewna zadania, oznacza je jako **Niska pewność** i **pozostawia niezaznaczone**. Nie jest ukrywane ani odrzucane — to Ty decydujesz, czy jest prawdziwe. Dobrze zrozumiane zadania są zaznaczone od razu, więc typowy przebieg to: podgląd, rzut oka, zatwierdzenie.',
        },
        {
          t: 'p',
          text: 'Przed zatwierdzeniem sprawdzane są dwie rzeczy: musi być zaznaczone co najmniej jedno zadanie, a każde zaznaczone zadanie musi mieć tytuł.',
        },
        { t: 'h3', text: 'Gdzie trafia zadanie' },
        {
          t: 'p',
          text: 'Jeśli tekst wskazuje historyjkę, którą ekstrakcja rozpozna, zadanie zostanie do niej zaproponowane. W przeciwnym razie pole Historyjka pokaże **Zaległości (bez historii)** — możesz je zmienić w każdym wierszu przed zatwierdzeniem.',
        },
        { t: 'h3', text: 'Prywatność' },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Twój tekst opuszcza aplikację',
          text: 'Przy podglądzie wpisany tekst jest wysyłany do skonfigurowanego dostawcy AI, wraz z **nazwami wyświetlanymi** członków projektu i **nazwami** jego historyjek — to właśnie pozwala rozpoznać „przypisz to Annie” albo dopasować wspomnianą historyjkę. Adresy e-mail i wewnętrzne identyfikatory nigdy nie są wysyłane. Sprawdź warunki swojego dostawcy, zanim skierujesz tu materiały poufne, zwłaszcza na darmowym planie.',
        },
        { t: 'h3', text: 'Gdy funkcja jest niedostępna' },
        {
          t: 'p',
          text: 'Szybkie dodawanie jest opcjonalne i wymaga skonfigurowanego dostawcy AI. Komunikat wskazuje, o który przypadek chodzi: że serwer nie ma skonfigurowanego dostawcy, że Twój klucz został odrzucony, że osiągnąłeś limit, albo że dostawca jest chwilowo nieosiągalny. Wszystkie pozostałe sposoby tworzenia zadań działają dalej. Własny klucz dostawcy dodasz w **Ustawieniach → Dostawcy AI**.',
        },
      ],
    },
    {
      id: 'members',
      label: 'Członkowie i role',
      heading: 'Członkowie i role',
      blocks: [
        { t: 'h3', text: 'Dwie role' },
        {
          t: 'table',
          head: ['Rola', 'Może'],
          rows: [
            [
              '**Menedżer**',
              'Wszystko to, co Współpracownik, a ponadto tworzyć, usuwać i archiwizować elementy, zapraszać i usuwać członków, wybierać rolę oferowaną w zaproszeniu oraz edytować ustawienia projektu',
            ],
            [
              '**Współpracownik**',
              'Przeglądać projekt, aktualizować statusy i dodawać komentarze',
            ],
          ],
        },
        { t: 'p', text: 'O tym, co możesz w danym projekcie, decydują dwie zasady:' },
        {
          t: 'ul',
          items: [
            '**Rola w projekcie ma pierwszeństwo przed rolą globalną.** Osoba będąca ogólnie Współpracownikiem może być Menedżerem w konkretnym projekcie i odwrotnie.',
            '**Właściciel projektu zawsze ma dostęp Menedżera**, niezależnie od wszystkiego innego.',
          ],
        },
        {
          t: 'p',
          text: 'Interfejs podąża za Twoją rolą: akcje, do których nie masz uprawnień, nie są pokazywane, więc Współpracownik widzi prostszy nagłówek projektu zamiast przycisków, które i tak by nie zadziałały.',
        },
        { t: 'h3', text: 'Zapraszanie osób' },
        {
          t: 'p',
          text: 'Użyj **Zaproś** w nagłówku projektu albo karty **Członkowie**. Podaj adres e-mail i wybierz oferowaną rolę. Zaproszenie zostanie wysłane mailem.',
        },
        { t: 'h3', text: 'Otrzymanie zaproszenia' },
        {
          t: 'p',
          text: 'Zaproszenia pojawiają się na stronie **Zaproszenia** wraz z informacją, kto zaprosił, jaką rolę oferuje i kiedy zaproszenie wygasa. **Akceptuj** dodaje Cię do projektu, **Odrzuć** je odrzuca. Oczekujące zaproszenia pokazują się jako liczba obok pozycji Zaproszenia w panelu bocznym.',
        },
        { t: 'h3', text: 'Usuwanie osoby' },
        {
          t: 'p',
          text: 'Karta Członkowie wymienia wszystkich z dostępem. Menedżerowie mogą stamtąd usunąć członka. Usunięcie odbiera dostęp; wykonana przez tę osobę praca zostaje.',
        },
      ],
    },
    {
      id: 'settings',
      label: 'Ustawienia',
      heading: 'Ustawienia',
      blocks: [
        {
          t: 'p',
          text: 'Ustawienia dzielą się na dwa zakresy: **Ustawienia aplikacji** (dotyczące Ciebie, wszędzie) i **Ustawienia projektu** (dotyczące jednego projektu).',
        },
        { t: 'h3', text: 'Ustawienia aplikacji' },
        { t: 'h4', text: 'Profil' },
        { t: 'p', text: 'Pokazuje Twoje imię, e-mail i rolę globalną. Poniżej **Wygląd**:' },
        {
          t: 'ul',
          items: [
            '**Motyw** — Jasny, Ciemny albo Systemowy (podąża za systemem operacyjnym).',
            '**Kolor akcentu** — indygo, fiolet, szmaragd, róż, bursztyn lub kamień. Zmienia kolor przycisków, wyróżnień i stanu aktywnego w całej aplikacji — łącznie z tym podręcznikiem.',
            '**Język** — angielski (en-GB) lub polski (pl). Zmiana działa natychmiast.',
          ],
        },
        { t: 'h4', text: 'Klucze API' },
        {
          t: 'p',
          text: 'Klucze z ograniczonym zakresem dla skryptów, integracji i agentów AI. Opisane w [Dla zaawansowanych](#power).',
        },
        { t: 'h4', text: 'Dostawcy AI' },
        {
          t: 'p',
          text: 'Podłącz własny klucz dostawcy LLM, aby zasilić [Szybkie dodawanie](#capture), zamiast polegać na współdzielonym kluczu serwera. Każdy dostawca pokazuje się jako **Nie skonfigurowany** lub **Skonfigurowany** wraz z kilkoma ostatnimi znakami klucza, żebyś wiedział, który jest zapisany. Możesz też ustawić:',
        },
        {
          t: 'ul',
          items: [
            '**nadpisanie modelu**, jeśli chcesz konkretny model zamiast domyślnego;',
            '**limit zapytań na minutę** i **limit tokenów na minutę**, pokazywane razem z maksimum, które Ci przysługuje — własne limity mogą być niższe od tego pułapu, ale nie wyższe;',
            '**użyj jako domyślnego dostawcy**, gdy skonfigurowano więcej niż jednego.',
          ],
        },
        {
          t: 'p',
          text: '**Wyczyść** usuwa zapisany klucz po potwierdzeniu; dostawca wraca do stanu nieskonfigurowanego.',
        },
        { t: 'h4', text: 'Bezpieczeństwo' },
        { t: 'p', text: 'Zmiana hasła — zobacz [Pierwsze kroki](#getting-started).' },
        { t: 'h3', text: 'Ustawienia projektu' },
        {
          t: 'p',
          text: 'Wybierz projekt z listy, a potem go skonfiguruj. Te kontrolki są dostępne tylko dla Menedżera.',
        },
        { t: 'h4', text: 'Statusy' },
        {
          t: 'p',
          text: 'Każdy projekt ma własny przepływ pracy. Nowe projekty startują z czterema statusami:',
        },
        {
          t: 'table',
          head: ['Status', 'Identyfikator'],
          rows: [
            ['Do zrobienia', '`to_do`'],
            ['W toku', '`in_progress`'],
            ['W przeglądzie', '`in_review`'],
            ['Gotowe', '`done`'],
          ],
        },
        {
          t: 'p',
          text: 'Możesz **dodawać** statusy, **zmieniać ich nazwy**, **kolor** oraz **kolejność** przyciskami w górę / w dół. Ustawiona kolejność to kolejność kolumn na tablicy. Każdy status ma identyfikator (slug), który jest stałym oznaczeniem używanym przez API i CLI.',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Usuwanie statusu',
          text: 'Elementy będące już w usuniętym statusie nie znikają — stają się **niewypisane** i trafiają do grupy „Statusy niewypisane”, żebyś mógł przenieść je gdzieś poprawnie. Przenieś pracę poza status przed jego usunięciem, a unikniesz sprzątania.',
        },
        { t: 'h4', text: 'Śledzenie wysiłku' },
        {
          t: 'p',
          text: 'Domyślnie wyłączone. Zaznacz **Włącz śledzenie wysiłku** i wybierz jednostkę — `sp` dla story pointów, `h` dla godzin albo cokolwiek innego do 20 znaków — a potem Zapisz. Po włączeniu zadania zyskują pole **Wysiłek**, a sprinty mogą porównywać przypisany wysiłek z pojemnością.',
        },
        { t: 'h4', text: 'Karty projektu' },
        {
          t: 'p',
          text: 'Własna karta **Ustawienia** projektu steruje jego paskiem kart: przeciągaj karty, aby zmienić kolejność, albo przełączaj kartę między **Widoczna** i **Ukryta**. Projekt, który nigdy nie używa sprintów, może ukryć Sprinty i Oś czasu i zachować czysty nagłówek. Ustawienia zawsze pozostają widoczne i ostatnie.',
        },
      ],
    },
    {
      id: 'power',
      label: 'Dla zaawansowanych',
      heading: 'Dla zaawansowanych',
      blocks: [
        {
          t: 'callout',
          kind: 'warn',
          label: 'Funkcje eksperymentalne',
          text: 'Narzędzie wiersza poleceń `spt` oraz serwer `spt-mcp` są eksperymentalne. Polecenia, flagi i format odpowiedzi mogą zmienić się między wydaniami bez okresu przejściowego, więc przypnij wersję, zanim oprzesz na nich skrypt lub automatyzację. Nie dotyczy to interfejsu webowego ani opisanych niżej kluczy API.',
        },
        {
          t: 'p',
          text: 'Wszystko w interfejsie webowym opiera się na REST API, a to API jest dostępne także bezpośrednio dla Ciebie — z wiersza poleceń, ze skryptów albo z asystenta AI.',
        },
        { t: 'h3', text: 'Instalacja narzędzi' },
        {
          t: 'p',
          text: 'Zarówno `spt`, jak i `spt-mcp` to punkty wejścia tego samego pakietu Pythona, więc jedna instalacja daje oba. Żaden z nich nie wymaga serwera na Twoim komputerze: są klientami API i łączą się z serwerem, który im wskażesz, więc nie ma bazy danych do skonfigurowania ani pliku `.env` do wypełnienia. Jedyne, co trzeba mieć wcześniej, to [uv](https://docs.astral.sh/uv/) — samo pobierze odpowiedniego Pythona (3.11 lub nowszego). Pobierz repozytorium, a następnie:',
        },
        { t: 'pre', code: 'cd backend\nuv tool install --editable .' },
        {
          t: 'p',
          text: 'To instaluje dwa polecenia we własnym, odizolowanym środowisku. `spt` jest gotowe, gdy tylko się zalogujesz — zaraz poniżej. `spt-mcp` nigdy nie uruchamiasz sam: robi to host LLM, a uwierzytelnia się kluczem API, a nie Twoim logowaniem, więc konfigurację opisuje osobno sekcja **Asystenci AI (MCP)** poniżej.',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Jeśli powłoka nie znajduje spt',
          text: '`uv tool install` umieszcza polecenia w `~/.local/bin` i na koniec ostrzega, jeśli tego katalogu nie ma w PATH — wtedy kolejny krok kończy się komunikatem _command not found_. Wykonaj `uv tool update-shell` i otwórz nowy terminal, co rozwiązuje to na stałe.',
        },
        { t: 'pre', code: 'spt auth login' },
        {
          t: 'p',
          text: 'Polecenie pyta o adres e-mail i hasło; hasło jest ukrywane podczas pisania i nigdy nie staje się częścią wpisanej komendy, więc nie trafia do historii powłoki. `--editable` powyżej sprawia, że instalacja wskazuje na pobrany katalog, więc `git pull` aktualizuje oba polecenia bez ponownej instalacji — ale przeniesienie lub usunięcie tego katalogu je psuje. Pomiń tę flagę, jeśli wolisz niezależną kopię.',
        },
        {
          t: 'p',
          text: 'Jeśli uruchamiasz też backend i wolisz trzymać polecenia w jego środowisku wirtualnym, zrobi to `uv pip install -e .` — ale trafią wtedy do `backend/.venv`, którego nie ma w PATH, więc każde polecenie wymaga przedrostka `uv run`. Poniższe przykłady zakładają, że `spt` działa samodzielnie.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Wskazanie CLI innego serwera',
          text: 'CLI łączy się z `http://localhost:8000`, o ile nie wskażesz inaczej. Zaloguj się do innego przez `--api-url`, które jest zapamiętywane dla kolejnych poleceń — słusznie, bo Twoje tokeny są ważne tylko na serwerze, który je wydał. Jednorazowo lub w skrypcie ustaw zamiast tego `SPT_API_URL` — tę samą zmienną czyta serwer MCP, więc jeden export kieruje oba w to samo miejsce. Ma pierwszeństwo przed zapisanym ustawieniem, ale nigdy nie trafia na dysk. Ustawienia i tokeny znajdują się w `~/.config/spt/config.json`. Uwaga: `spt config set` to co innego — zmienia preferencje Twojego konta na serwerze, a nie połączenie samego CLI.',
        },
        { t: 'pre', code: 'spt auth login --api-url https://spt.example.com' },
        { t: 'h3', text: 'Klucze API' },
        { t: 'path', text: 'Ustawienia → Ustawienia aplikacji → Klucze API' },
        {
          t: 'p',
          text: 'Klucz API pozwala skryptowi lub agentowi działać na Twoich projektach bez przekazywania hasła. Nadaj kluczowi **etykietę**, żeby go później rozpoznać, i zaznacz dokładnie te **uprawnienia**, których potrzebuje:',
        },
        {
          t: 'table',
          head: ['Uprawnienie', 'Daje'],
          rows: [
            ['`read:projects` / `write:projects`', 'Podgląd / modyfikacja projektów'],
            ['`read:stories` / `write:stories`', 'Podgląd / modyfikacja historyjek'],
            ['`read:tasks` / `write:tasks`', 'Podgląd / modyfikacja zadań'],
            ['`read:comments` / `write:comments`', 'Podgląd / dodawanie komentarzy'],
          ],
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Skopiuj klucz od razu',
          text: 'Klucz jest pokazywany raz, przy tworzeniu, i nigdy więcej. Skopiuj go do menedżera haseł lub konfiguracji przed zamknięciem okna. Jeśli go zgubisz, odwołaj go i utwórz nowy.',
        },
        {
          t: 'p',
          text: 'Klucze **wygasają**. Nowy klucz działa 90 dni, o ile nie wybierzesz inaczej, a lista pokazuje datę wygaśnięcia obok etykiety, uprawnień i informacji o ostatnim użyciu — **Nigdy**, jeśli nie był używany. **Odwołaj** natychmiast wyłącza klucz. Klucz użyty ostatnio później, niż się spodziewasz, warto odwołać od razu.',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Uprawnienia są granicą',
          text: 'To, co klucz może zrobić, zależy wyłącznie od jego uprawnień, a nie od tego, co się nim łączy. Naprawdę tylko-do-odczytu jest ten agent, którego klucz utworzono wyłącznie z uprawnieniami `read:` — nic innego tego nie wymusza.',
        },
        { t: 'h3', text: 'Wiersz poleceń' },
        {
          t: 'p',
          text: 'CLI `spt` odzwierciedla interfejs webowy. Zaloguj się raz, a potem pracuj z terminala:',
        },
        {
          t: 'pre',
          code: 'spt auth login\n\nspt projects list\nspt stories list <project_id>\nspt tasks list <story_id>\nspt comments add task:<id> "Wygląda dobrze"\nspt invitations list',
        },
        {
          t: 'p',
          text: 'Zwróć uwagę na kształty poleceń: `tasks list` przyjmuje identyfikator **historyjki**, bo zadania żyją pod historyjkami — dla zadań na poziomie projektu użyj historyjki Zaległości. Polecenia komentarzy przyjmują odwołanie do elementu, a nie samo id: `project:<id>`, `story:<id>` albo `task:<id>`. Dodaj `--all` do polecenia listującego, aby przejść przez wszystko zamiast pierwszych 25 pozycji.',
        },
        {
          t: 'p',
          text: 'Szybkie dodawanie działa też z terminala. Wypisuje wyodrębnione zadania i czeka na potwierdzenie, dokładnie jak interfejs webowy; przekaż `--yes`, aby pominąć pytanie w skrypcie. Użyj `--file` (albo `-`, aby czytać ze standardowego wejścia) zamiast podawać tekst jako argument, a nie trafi on do historii powłoki:',
        },
        {
          t: 'pre',
          code: 'spt tasks capture <project_id> --file notatki.txt\necho "poproś Annę o przegląd ścieżki zakupowej do piątku" | spt tasks capture <project_id> -',
        },
        {
          t: 'p',
          text: 'Raportowanie czasu jest dostępne tylko w CLI — to tutaj żyją liczby zbiorcze:',
        },
        {
          t: 'pre',
          code: 'spt time-metrics    # czas w każdym statusie dla elementu\nspt time-history    # surowy ślad zmian statusu\nspt time-report     # sumy zbiorcze per projekt lub per użytkownik',
        },
        {
          t: 'p',
          text: 'Zarządzaj własnymi danymi dostawcy AI bez wychodzenia z powłoki. Polecenie `set` pyta o klucz z ukrytym wejściem, więc nigdy nie trafia on do historii powłoki:',
        },
        {
          t: 'pre',
          code: 'spt config llm list\nspt config llm providers\nspt config llm set google\nspt config llm delete google',
        },
        {
          t: 'p',
          text: 'Większość poleceń działa z zapisanego logowania. `spt tasks capture` przyjmuje dodatkowo `--api-key` albo zmienną środowiskową `SPT_API_KEY`, więc może działać bez nadzoru; pozostałe polecenia nadal wymagają `spt auth login`.',
        },
        { t: 'h3', text: 'Asystenci AI (MCP)' },
        {
          t: 'p',
          text: 'Serwer `spt-mcp` udostępnia narzędzie hostowi LLM, takiemu jak Claude Code czy Claude Desktop, więc asystent może bezpośrednio przeglądać i edytować Twoje projekty. Pochodzi z tej samej instalacji co CLI — zobacz Instalację narzędzi powyżej.',
        },
        { t: 'p', text: 'Utwórz klucz z ograniczonym zakresem, a potem zarejestruj serwer:' },
        {
          t: 'pre',
          code: 'spt config api-keys create --label "claude-code" \\\n  --scopes read:projects,read:stories,read:tasks,read:comments,write:tasks,write:comments\n\nclaude mcp add spt -e SPT_API_KEY=<key> -e SPT_API_URL=http://localhost:8000 -- spt-mcp',
        },
        {
          t: 'callout',
          kind: 'warn',
          label: 'Host musi umieć znaleźć spt-mcp',
          text: 'To ostatnie `spt-mcp` jest poleceniem uruchamianym przez Twojego hosta LLM, więc musi być dostępne w _jego_ PATH — a nie tylko w powłoce, w której aktywowałeś środowisko wirtualne. Jeśli host zgłosi, że serwer się nie uruchomił, podaj pełną ścieżkę, na przykład `/ścieżka/do/simple-project-tool/backend/.venv/bin/spt-mcp`, albo zainstaluj pakiet przez `uv tool install --editable .`, żeby polecenie było dostępne wszędzie.',
        },
        {
          t: 'p',
          text: 'Asystent może następnie wyszukiwać (`list_projects`, `get_task`, `search`, `list_comments`), wprowadzać zmiany (`update_task`, `create_task`, `create_story`, `add_comment`) i uruchamiać szybkie dodawanie (`capture_tasks`, `confirm_capture`).',
        },
        {
          t: 'callout',
          kind: 'note',
          label: 'Czego asystent nie może',
          text: 'Celowo **nie ma narzędzi usuwania ani zarządzania członkami**. Asystent nie zniszczy Twojej pracy ani nie zmieni tego, kto ma dostęp do projektu, o cokolwiek zostałby poproszony. Poza tym prawdziwą granicą są uprawnienia wydanego klucza — wydaj klucz tylko-do-odczytu, jeśli chcesz, żeby jedynie przeglądał.',
        },
        { t: 'h3', text: 'REST API' },
        {
          t: 'p',
          text: 'Interaktywna dokumentacja API jest serwowana przez sam backend pod `/docs` (Swagger UI) i `/redoc`. Kilka konwencji wartych zapamiętania:',
        },
        {
          t: 'ul',
          items: [
            'Wszystkie punkty końcowe znajdują się pod `/api/v1/`.',
            'Aktualizacje używają `PATCH` i tylko tych pól, które zmieniasz.',
            'Listy są stronicowane kursorem: `?cursor=<id>&limit=25`.',
            'Błędy wracają jako `{"error": {"code": ..., "message": ...}}`.',
          ],
        },
      ],
    },
  ],
}

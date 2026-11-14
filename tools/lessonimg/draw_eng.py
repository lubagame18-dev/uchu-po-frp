# Собственные грамматические схемы по английскому языку (e_…). Подключается из draw_ru.py (exec), использует его помощники.
# Правила: tools/lessonimg/eng_own.txt (сначала своя схема, затем фото по теме).
table("e_present_simple", "Present Simple", "Present Simple: I work – he works; вопросы с do/does, отрицание с don't/doesn't",
      "Present Simple – обычно, всегда", ["", "Утверждение", "Отрицание / вопрос"],
      [["I / you / we / they", "I *work*.", "I *don't* work. *Do* you…?"], ["he / she / it", "She *works*.", "She *doesn't* work. *Does* she…?"]], [400, 480, 740])
table("e_present_cont", "Present Continuous", "Present Continuous: am/is/are + глагол с окончанием -ing – действие сейчас",
      "Present Continuous – сейчас: am / is / are + -ing", ["Кто", "Форма", "Пример"],
      [["I", "*am* + -ing", "I *am reading* now."], ["he / she / it", "*is* + -ing", "He *is playing* football."], ["you / we / they", "*are* + -ing", "They *are swimming*."]], [400, 420, 800])
boxes("e_ps_vs_pc", "Present Simple и Present Continuous", "Сравнение: Present Simple – обычно, Present Continuous – сейчас",
      "Обычно или сейчас?", [("Present Simple", "I usually walk to school. – every day, usually, often"), ("Present Continuous", "I am walking to school now. – now, at the moment, look!")], cols=2)
table("e_past_reg", "Past Simple: правильные глаголы", "Правильные глаголы в Past Simple получают окончание -ed",
      "Past Simple: глагол + -ed", ["Глагол", "Past Simple", "Правило"],
      [["work", "work*ed*", "+ ed"], ["play", "play*ed*", "+ ed"], ["live", "liv*ed*", "+ d"], ["stop", "sto*pped*", "удвоение согласной"], ["study", "stud*ied*", "y → ied"]], [420, 520, 680])
table("e_past_irreg", "Неправильные глаголы", "Неправильные глаголы: три формы",
      "Неправильные глаголы", ["V1", "V2 (Past Simple)", "V3 (Participle II)"],
      [["go", "*went*", "*gone*"], ["see", "*saw*", "*seen*"], ["buy", "*bought*", "*bought*"], ["have", "*had*", "*had*"], ["write", "*wrote*", "*written*"]], [480, 560, 580])
table("e_was_were", "Past Simple: was и were", "Глагол to be в прошедшем времени: was и were",
      "to be в прошедшем времени", ["Кто", "Форма", "Пример"],
      [["I / he / she / it", "*was*", "I *was* at home yesterday."], ["you / we / they", "*were*", "They *were* in London."]], [440, 300, 880])
table("e_past_cont", "Past Continuous", "Past Continuous: was/were + -ing – действие в процессе в прошлом",
      "Past Continuous: was / were + -ing", ["Кто", "Форма", "Пример"],
      [["I / he / she / it", "*was* + -ing", "I *was reading* at 5 pm."], ["you / we / they", "*were* + -ing", "We *were playing* tennis."]], [400, 380, 840])
table("e_present_perfect", "Present Perfect", "Present Perfect: have/has + третья форма глагола – результат к настоящему моменту",
      "Present Perfect: have / has + V3", ["Кто", "Форма", "Пример"],
      [["I / you / we / they", "*have* + V3", "I *have finished* my homework."], ["he / she / it", "*has* + V3", "She *has visited* Paris."]], [400, 380, 840])
boxes("e_future_simple", "Future Simple", "Future Simple: will + глагол – решение, обещание, предсказание",
      "Future Simple: will + глагол", [("I will help you.", "обещание"), ("It will rain tomorrow.", "предсказание"), ("Will you come?  –  I won't.", "вопрос и отрицание")])
boxes("e_going_to", "Конструкция to be going to", "Be going to + глагол – планы и намерения",
      "am / is / are going to + глагол", [("I am going to visit my granny.", "план"), ("Look at the clouds! It is going to rain.", "видно по признакам")], cols=2)
boxes("e_can", "Модальный глагол can", "Can – умею, могу; can't – не умею",
      "can + глагол", [("I can swim.", "умею"), ("I can't ski.", "не умею"), ("Can you dance?", "Yes, I can. / No, I can't.")])
boxes("e_must", "Must, mustn't, should", "Must – должен, mustn't – нельзя, should – следует",
      "Модальные глаголы", [("must", "You must wear a helmet."), ("mustn't", "You mustn't run here."), ("should", "You should go to bed early.")])
boxes("e_have_got", "Конструкция have got", "Have got / has got – у меня есть",
      "have got / has got – «у меня есть»", [("I have got a dog.", "I / you / we / they"), ("She has got a cat.", "he / she / it"), ("Have you got a pen?", "Yes, I have. / No, I haven't.")])
boxes("e_there_is", "There is / there are", "There is – с единственным числом, there are – с множественным",
      "There is / There are", [("There is a book on the table.", "одна вещь"), ("There are two chairs in the room.", "много вещей"), ("Is there a TV?", "Yes, there is.")])
boxes("e_some_any", "Some и any", "Some – в утверждениях, any – в вопросах и отрицаниях",
      "Some и any", [("some", "There are some apples."), ("any (вопрос)", "Are there any apples?"), ("any (отрицание)", "There aren't any apples.")])
boxes("e_much_many", "Much и many", "Many – с исчисляемыми, much – с неисчисляемыми существительными",
      "Much и many", [("many + исчисляемые", "many books, many apples"), ("much + неисчисляемые", "much water, much time"), ("a lot of", "с любыми")])
boxes("e_countable", "Исчисляемые и неисчисляемые", "Исчисляемые существительные можно посчитать, неисчисляемые – нет",
      "Countable / Uncountable", [("Исчисляемые", "an apple – two apples"), ("Неисчисляемые", "water, milk, bread, money")], cols=2)
table("e_plural", "Множественное число", "Образование множественного числа существительных: -s, -es, особые формы",
      "Множественное число", ["Правило", "Пример"],
      [["+ s", "cat → cat*s*"], ["s, x, sh, ch + es", "box → box*es*"], ["согласная + y → ies", "city → cit*ies*"], ["особые", "child → *children*, man → *men*"]], [700, 920])
table("e_possessive", "Притяжательные местоимения", "Притяжательные местоимения: my, your, his, her, its, our, their",
      "Чей? – притяжательные местоимения", ["Кто", "Чей", "Пример"],
      [["I", "*my*", "my bag"], ["you", "*your*", "your book"], ["he", "*his*", "his dog"], ["she", "*her*", "her cat"], ["we / they", "*our* / *their*", "our house, their car"]], [380, 500, 740])
table("e_this_that", "This и that", "This/these – близко, that/those – далеко",
      "This, that, these, those", ["", "Близко", "Далеко"], [["Ед. число", "*this* toy", "*that* toy"], ["Мн. число", "*these* toys", "*those* toys"]], [400, 600, 620])
table("e_comparative", "Степени сравнения прилагательных", "Сравнительная и превосходная степени: big – bigger – the biggest",
      "Степени сравнения", ["Прилагательное", "Сравнительная", "Превосходная"],
      [["big", "big*ger*", "the big*gest*"], ["happy", "happ*ier*", "the happ*iest*"], ["beautiful", "*more* beautiful", "the *most* beautiful"], ["good", "*better*", "the *best*"]], [500, 560, 560])
boxes("e_superlative", "Превосходная степень", "Превосходная степень: the + -est или the most",
      "Превосходная степень: the …est / the most …", [("the highest", "Everest is the highest mountain."), ("the most interesting", "It is the most interesting book."), ("the best / the worst", "особые формы")])
boxes("e_passive", "Страдательный залог", "Past Simple Passive: was/were + третья форма глагола",
      "Past Simple Passive: was / were + V3", [("The bridge was built in 1900.", "мост был построен"), ("The letters were written by Tom.", "письма были написаны")], cols=2)
boxes("e_reported", "Косвенная речь", "Косвенная речь: сдвиг времён – am → was, will → would",
      "Reported speech", [("He said, “I am tired.”", "прямая речь"), ("He said that he was tired.", "косвенная речь")], cols=2, flow=True)
boxes("e_cond1", "First Conditional", "Условные предложения первого типа: реальное условие в будущем",
      "If + Present Simple, … will + глагол", [("If it rains,", "условие"), ("we will stay at home.", "результат")], cols=2, flow=True)
boxes("e_cond2", "Second Conditional", "Условные предложения второго типа: нереальное условие в настоящем",
      "If + Past Simple, … would + глагол", [("If I had a million,", "нереальное условие"), ("I would travel around the world.", "результат")], cols=2, flow=True)
table("e_prep_time", "Предлоги времени", "Предлоги времени at, on, in",
      "at, on, in – когда?", ["Предлог", "С чем", "Пример"], [["*at*", "время", "at 7 o'clock"], ["*on*", "дни, даты", "on Monday, on 5 May"], ["*in*", "месяцы, годы, части дня", "in May, in 2025, in the morning"]], [300, 560, 760])
boxes("e_prep_place", "Предлоги места", "Предлоги места: in, on, under, next to, behind",
      "Where is the cat?", [("in", "in the box"), ("on", "on the table"), ("under", "under the chair"), ("next to", "next to the door"), ("behind", "behind the sofa")], cols=5, sub=28)
boxes("e_like", "I like / I don't like", "Выражение предпочтений: I like…, I don't like…",
      "I like … / I don't like …", [("I like apples.", "мне нравится"), ("I don't like milk.", "мне не нравится"), ("Do you like cats?", "Yes, I do. / No, I don't.")])
boxes("e_like_doing", "Like doing", "После like, love, hate глагол с окончанием -ing",
      "like / love / hate + -ing", [("I like reading.", ""), ("She loves dancing.", ""), ("They hate getting up early.", "")])
boxes("e_wearing", "I am wearing", "Описание одежды: I am wearing…",
      "What are you wearing?", [("I am wearing a red T-shirt.", ""), ("She is wearing a blue dress.", ""), ("He is wearing jeans.", "")])
table("e_numbers", "Числительные 1–10", "Числительные от 1 до 10 по-английски",
      "Numbers 1–10", ["1", "2", "3", "4", "5"], [["one", "two", "three", "four", "five"], ["*6* six", "*7* seven", "*8* eight", "*9* nine", "*10* ten"]])
card("e_abc_am", "Английский алфавит: A–M", "Буквы английского алфавита от A до M",
     "A – M", [["*A a*", "*B b*", "*C c*", "*D d*", "*E e*"], ["*F f*", "*G g*", "*H h*", "*I i*"], ["*J j*", "*K k*", "*L l*", "*M m*"]])
card("e_abc_nz", "Английский алфавит: N–Z", "Буквы английского алфавита от N до Z",
     "N – Z", [["*N n*", "*O o*", "*P p*", "*Q q*", "*R r*"], ["*S s*", "*T t*", "*U u*", "*V v*"], ["*W w*", "*X x*", "*Y y*", "*Z z*"]])
boxes("e_greetings", "Приветствие и прощание", "Приветствие и прощание по-английски",
      "Hello! Goodbye!", [("Hello! / Hi!", "Привет!"), ("Good morning!", "Доброе утро!"), ("Goodbye! / Bye!", "До свидания!"), ("See you!", "Увидимся!")], cols=2)
boxes("e_name_age", "Как тебя зовут?", "Знакомство: What's your name? How old are you?",
      "Getting to know you", [("What's your name?", "My name is Anna."), ("How old are you?", "I'm eight.")], cols=2)

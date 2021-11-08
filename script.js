import { verses } from './verses.js';
import { patienceDiff } from './patienceDiff.js';

function countCharDiff(a, b) {
  let charDiffCount = 0;
  for(let ci of patienceDiff(a, b).lines) { //ci = characterInfo
    if(ci.aIndex === -1 || ci.bIndex === -1) charDiffCount++;
  }
  return charDiffCount;
}
function parsePunc(v) {
  return v.replaceAll(/[\.,\-'":\(\);]/g, '')
}

const submitButton = document.getElementById('answer-submit');
submitButton.onclick = () => currentSession.submit();
document.getElementById('answer').onpaste = e => e.preventDefault();

class Verse { //Represents a verse
  constructor(book, chapter, verse) {
    this.book = book;
    this.chapter = chapter;
    this.verse = verse;
    this.content = verses.book[this.book].chapter[this.chapter].verse[this.verse];
  }
  static parse(verse) { //Get rid of notations
    return verse.replaceAll(/[\[\]=\d\|]/g, '');
  }
  static questionize(verse) { //Create questions and answers based on notations
    let q = [];
    let i = 1;
    if (verse.indexOf(i) === -1) { //no notations?
      return console.log('no question about it');
    } else {
      for (; ;) {
        const start = verse.indexOf(`${i}=`) + 2; //Get start of question
        const end = verse.indexOf(`${i}|`) + 2; //Get end of question
        const question = Verse.parse(verse.slice(start, end)); //Get question, parse
        q.push({ //Add to question list
          question: `${start - 2 !== 0 ? '...' : ''}${question}`, //question...
          answers: [Verse.parse(verse).trim(), Verse.parse(verse.slice(end, verse.length)).trim()], //Either the whole verse or the end of the question to the end of the verse
          id: i //ID of question in verse
        });
        i++;
        if (verse.indexOf(i) === -1) { //If there are no more questions in verse, finish
          break;
        }
      }
    }
    return q;
  }
}

let recognition;
if ('webkitSpeechRecognition' in window) {
  recognition = new webkitSpeechRecognition();
}
class Session { //Represents a quiz practice session
  constructor(...range) { //range: format should be e.g. [["romans", 5], ["james", 0]] for Romans up to chapter five and no James
    this.range = range;
    this.questionHistory = [];
    this.status = 'waiting'; //waiting = waiting to start, active, ended = completed or quit, next = waiting for next question
    this.correct = 0;
    this.incorrect = 0;
    this.currentQuestion = null;
    this.micActive = false;
  }
  init() {
    this.status = 'active';
    this.newQuestion();
  }
  end() {
    this.status = 'ended';
    document.getElementById("blur").style.display = 'block';
    document.getElementById("end").style.display = 'table';
    document.getElementById('percentage').innerText = Math.round((this.correct / this.questionHistory.length) * 100) + '%';
    document.getElementById('correct').innerText = this.correct;
    document.getElementById('incorrect').innerText = this.incorrect;
    document.getElementById('total-questions').innerText = this.questionHistory.length;
  }
  update() {
    document.getElementById('text').innerHTML = this.currentQuestion.questions[this.currentQuestion.id - 1].question + ' <b>?</b>'; //Update text display 
    document.getElementById('reference').innerHTML = `${this.currentQuestion.verse.book.replace(this.currentQuestion.verse.book.charAt(0), this.currentQuestion.verse.book.charAt(0).toUpperCase())} ${this.currentQuestion.verse.chapter}:${this.currentQuestion.verse.verse}`; //Update reference display to instance reference, capitalize first letter of book name
  }
  newQuestion() { //get a random question, change display
    if (this.status === 'ended') return; //If ended, don't find another question
    submitButton.innerText = 'Submit';
    document.getElementById('answer').value = '';
    document.getElementById('verse').style.borderColor = '#000000';
    const b = Math.floor(Math.random() * this.range.length); //get random book
    const c = Math.ceil(Math.random() * this.range[b][1]); //get random chapter #
    const v = Math.ceil(Math.random() * Object.keys(verses.book[this.range[b][0]].chapter[c].verse).length);//get random verse #
    const question = { //Store info about question
      verse: new Verse(this.range[b][0], c, v),
      reference: `${["romans", "james"][b]} ${c}:${v}`,
      get questions() { return Verse.questionize(this.verse.content); }
    };
    question.id = Math.ceil(Math.random() * question.questions.length);
    if (this.questionHistory.includes(`${question.reference} ${question.id}`)) { //If question has already been answered
      let bookRange;
      let totalVerses = 0;
      for (let b in verses.book) { //Get number of verses answered
        for (let c in verses.book[b].chapter) {
          let book = b;
          for (let r of this.range) {
            if (r[0] === b) {
              bookRange = r[1];
            }
          }
          if (Number(c) <= bookRange) {
            totalVerses += Object.keys(verses.book[b].chapter[c].verse).length;
          }
        }
      }

      if (this.questionHistory.length >= totalVerses) { //End if there are no more verses
        this.end();
        return;
      }
      else {
        this.newQuestion();
      }
    }
    else {
      if (this.questionHistory.length >= 20) return this.end(); //End if 20 questions are answered
      this.questionHistory.push(`${question.reference} ${question.id}`);
      this.currentQuestion = question;
      this.update();
    }
  }
  mic() {
    if (!recognition) {
      document.getElementById('webspeech-error').style.display = 'block';
      document.getElementById('ws-e-ok').onclick = () => document.getElementById('webspeech-error').style.display = 'none';
    }
    if (this.micActive) {
      recognition.stop();
      return;
    }

    recognition.lang = 'en-US'; //Set recog lang
    recognition.continuous = true; //dont stop recording if user pauses
    recognition.interimResults = true; //get interim results for more accuracy

    let transcription = ''; //final transcription
    recognition.start(); //start recog
    recognition.onstart = () => { //on start
      this.micActive = true;
      document.getElementById('answer').placeholder = 'Say something clearly and slowly...';
      document.getElementById('answer').style.border = '1px solid #FF0000';
    }
    recognition.onresult = event => {
      for (let r = event.resultIndex; r < event.results.length; r++) {
        if (event.results[r].isFinal) transcription += event.results[r][0].transcript; //get user speech
      }
      document.getElementById('answer').value = transcription;
    }

    recognition.onend = () => {
      this.micActive = false;
      document.getElementById('answer').placeholder = 'Type here...';
      document.getElementById('answer').style.border = '1px solid #000000';
    }
  }
  submit() {
    if (this.status === 'ended') return;
    if (this.micActive) {
      recognition.stop();
    }
    document.getElementById('answer-info').innerText = '';
    if (this.status === 'next') {
      this.status = 'active';
      this.newQuestion();
      return;
    }
    const userAnswer = parsePunc(document.getElementById('answer').value.toUpperCase()).trim(); //Get user answer
    if (!userAnswer) { //If user input is empty
      document.getElementById('answer-info').innerHTML = 'You forgot to type the answer!';
    }
    else {
      let answers = this.currentQuestion.questions[this.currentQuestion.id - 1].answers; //Get answers
      answers.forEach(a => {
        answers.push(parsePunc(a).replaceAll('-', ' '))
      });
      answers.map(a => a.toUpperCase());
      const question = this.currentQuestion.questions[this.currentQuestion.id - 1].question; //Get question
      document.getElementById('text').innerHTML = `${question} <b>${answers[1]}<b>`; //Update display
      answers = answers.map(a => a.toUpperCase().trim()); //Change values to all upper case

      const charDiff = () => {
        const res1 = countCharDiff(answers[2], parsePunc(userAnswer));
        const res2 = countCharDiff(answers[3], parsePunc(userAnswer));

        return res1 < res2 ? res1 : res2;
      };
      
      if (answers.includes(userAnswer) || answers.includes(parsePunc(userAnswer)) || charDiff() < 8) { //Correct?
        document.getElementById('verse').style.borderColor = '#25B213';
        this.correct++;
      }
      else { //Incorrect?
        document.getElementById('verse').style.borderColor = '#FF0000';
        this.incorrect++;
      }
      document.getElementById('answer-submit').innerText = 'Next';
      this.status = 'next';
    }
  }
}
let currentSession = new Session(["romans", 1, 1], ["james", 1, 3])
currentSession.init();

document.getElementById('mic-button').onclick = () => { if (currentSession.status === 'active') currentSession.mic(); } //Mic clicked

let bookSelection = {
  "romans": null,
  "james": null,
  reset() {
    this['romans'] = null;
    this['james'] = null;
  }
};

function newQuiz() {
  const previousChildren = document.getElementsByClassName('cs-button'); //Remove all previous chapter # in cs ui
  document.getElementById('answer-info').innerText = '';

  while (previousChildren[0]) {
    previousChildren[0].parentNode.removeChild(previousChildren[0]);
  }
  bookSelection.reset();

  const addButtons = book => {
    let elt;
    const count = Object.keys(verses.book[book].chapter).length;
    if (book == 'romans') elt = document.getElementById('romans');
    else if (book == 'james') elt = document.getElementById('james');

    if (!count) return console.log('Book given not found');

    for (let i = 0; i < count; i++) { //create buttons
      const cElt = document.createElement('div');
      cElt.className = 'cs-button button-animation';
      
      cElt.id = i + 1;
      cElt.innerText = i + 1;

      elt.appendChild(cElt);
    }

    document.getElementById('blur').style.display = 'block';
    document.getElementById('chapter-select').style.display = 'block';
    document.getElementById('cs-r-display').innerHTML = 'Romans 1 - <b>?</b>';
    document.getElementById('cs-j-display').innerHTML = 'James 1 - <b>?</b>';
  };
  addButtons('romans');
  addButtons('james');

  const csButtons = document.querySelectorAll('.cs-button');

  csButtons.forEach(b => b.addEventListener("click", e => { //assign event listener (click) for every button
    const elementID = e.target.id;
    const book = e.target.parentElement.id;

    document.getElementById(`cs-${book.charAt(0)}-display`).innerHTML = `${book == 'romans' ? 'Romans' : "James"} ${elementID != 1 ? '1 -' : ''} <b>${elementID}</b>`;
    if (book == 'romans') bookSelection['romans'] = elementID;
    if (book == 'james') bookSelection['james'] = elementID;
  }));

  //Cancel button
  document.getElementById("cs-cancel").onclick = () => {
    bookSelection.reset();
    [document.getElementById('blur'), document.getElementById('chapter-select')].forEach(e => {
      e.style.display = 'none';
    });
  }
}

//New quiz button
document.getElementById('new-quiz').onclick = () => newQuiz();
//End quiz show elements
document.getElementById('end-new-quiz').onclick = e => {
  newQuiz();
  e.target.parentElement.parentElement.style.display = 'none';
}
//Book selection
document.getElementById('cs-ok').onclick = () => {
  if (!bookSelection['romans'] && !bookSelection['james']) return document.getElementById('cs-ok').style.boxShadow = '0px 0px 5px #ff0000';

  document.getElementById('cs-ok').style.removeProperty('box-shadow');
  document.getElementById('chapter-select').style.display = 'none';
  document.getElementById('blur').style.display = 'none';

  if (bookSelection['romans'] && bookSelection['james']) currentSession = new Session(['romans', bookSelection['romans']], ['james', bookSelection['james']]); //done
  else if (bookSelection['romans']) currentSession = new Session(['romans', bookSelection['romans']]);
  else if (bookSelection['james']) currentSession = new Session(['james', bookSelection['james']])
  currentSession.init();
}
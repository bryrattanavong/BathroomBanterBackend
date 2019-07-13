
// ==================================================================================
// Declaration of constant variables and imports of node modules
require('dotenv').config();
const sqlite3 = require('sqlite3');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
const express = require('express');
const crypto = require('crypto');
const PORT = process.env.PORT || 8080
const app = express();

var googleMapsClient = require('@google/maps').createClient({
  key: process.env.GOOGLE_KEY,
});


let db = new sqlite3.Database('./washrooms.db',sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the washroom database.');
});

let db1 = new sqlite3.Database('./buildings.db',sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the buildings database.');
});

let usersDB = new sqlite3.Database(process.env.DB_FILE,sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the users database.');
});

let commentsDB = new sqlite3.Database('./comments.db',sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error(err.message);
  }
  console.log('Connected to the comments database.');
});
// ==================================================================================


// ==================================================================================
// Middleware declaration
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});
// ==================================================================================


// ==================================================================================
// API GET Requests

//Gets closest buildings from Coord
//Exaple Request: http://localhost:3000/getLocationFromCoord?latitude=45.3820829&longitude=-75.6994726
app.get('/getBuildingsFromCoord', (request, res) => {
  var buildingsArray = [];
  var returnObj = {};
  var latitude = request.query.latitude;
  var longitude = request.query.longitude;
  var sqlQuery = 'SELECT name, lat, long FROM buildings;';
  db1.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      var building = {name: element.name, lat: element.lat, long: element.long};
      buildingsArray.push(building);
    });
    var coords = [];
    for (var i = 0; i < buildingsArray.length; i++) {
      coords.push(buildingsArray[i].lat + ',' + buildingsArray[i].long);
    }
    googleMapsClient.distanceMatrix({
      origins: latitude + ',' + longitude,
      destinations: coords,
      mode: 'walking'
    }, function(err, response) {
      if (!err) {
        var arrayOfBuildingObjs = [];
        for (var i = 0; i < response.json.rows[0].elements.length; i++) {
          arrayOfBuildingObjs.push({name:buildingsArray[i].name, distance:response.json.rows[0].elements[i].distance.value });
          console.log(buildingsArray[i].name + ' is ' + response.json.rows[0].elements[i].distance.value + 'm away.');
        }
        arrayOfBuildingObjs.sort(function(a, b){return a.distance-b.distance});
        console.log(arrayOfBuildingObjs);
        var returnArray = [];
        for (var i = 0; i < arrayOfBuildingObjs.length; i++) {
          returnArray.push(arrayOfBuildingObjs[i].name);
        }
        returnObj.listOfBuildings = returnArray;
        res.json(returnObj);
      }
      else{
        console.log(err);
      }
    });
  });

});
//Gets a list for all the buildings
app.get('/listOfBuildings', (request, response) => {
  var returnObj = {};
  var listOfBuildings = [];
  var innerObj = {};
  var listOfFloors = [];
  var sql = 'SELECT name FROM buildings;';
  db1.all(sql, [], (err, row) => {
    console.log(row.length);
    row.forEach((element) => {
      innerObj = {};
      innerObj.name = element.name;
      innerObj.listOfFloors = [];
      getFloors(element, innerObj, function callback(object){
        listOfBuildings.push(object);
        console.log(object);
        if(listOfBuildings.length == row.length){
          returnObj.listOfBuildings = listOfBuildings;
          response.json(returnObj);
        }
      });
    });
  });
});

function getFloors(element, innerObj, callback){
  var sql1 = 'SELECT floor FROM washrooms WHERE building LIKE "%' + element.name + '%";';
  console.log(sql1);
  db.all(sql1, [], (err, rows) => {
    rows.forEach((elements) => {
      if(innerObj.listOfFloors.indexOf(elements.floor) == -1){
        innerObj.listOfFloors.push(elements.floor);
      }
    });
    callback(innerObj);
  });
}

// Gets a list of floors for a building
// Example Request: http://localhost:3000/listOfFloors?building=Herzberg+Laboratories
app.get('/listOfFloors', (request, response) => {
  var returnObject = {};
  var listOfFloors = [];
  var sqlQuery = 'SELECT floor FROM washrooms WHERE building LIKE "%' + request.query.building + '%";';
  db.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      if(listOfFloors.indexOf(element.floor) == -1){
        console.log(request.query.building + ' has Floor: ' + element.floor);
        listOfFloors.push(element.floor);
      }
    });
    returnObject.listOfFloors = listOfFloors;
    response.json(returnObject);
  });
});

// Gets a list of washrooms on floor for a building
// Example Request: http://localhost:3000/listOfWashroomsOnFloor?building=Herzberg+Laboratories&floor=4&sort=average_rating
app.get('/listOfWashroomsOnFloor', (request, response) => {
  var returnObject = {};
  var listOfWashrooms = [];
  var sqlQuery = 'SELECT id, room_num FROM washrooms WHERE building LIKE "%' + request.query.building + '%" AND floor = "'+ request.query.floor + '" AND ' + request.query.gender + ' = 1 ORDER BY ' + request.query.sort + ' DESC;';
  db.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      if(listOfWashrooms.indexOf(element.room_num) == -1){
        console.log(request.query.building + ' has Washroom ' + element.room_num + ' on floor ' + request.query.floor);
        listOfWashrooms.push(element.id);
      }
    });
    returnObject.listOfWashrooms = listOfWashrooms;
    response.json(returnObject);
  });

});

app.get('/allWashrooms', (request, response) => {
  var returnObject = {};
  var listOfWashrooms = [];
  var tempWashroom = {}
  var sqlQuery = 'SELECT * FROM washrooms';
  db.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      tempWashroom.male = element.male;
      tempWashroom.female = element.female;
      tempWashroom.average_rating = element.average_rating;
      tempWashroom.cleanliness = element.cleanliness;
      tempWashroom.size = element.size;
      tempWashroom.toilet_paper = element.toilet_paper;
      tempWashroom.traffic = element.traffic;
      tempWashroom.id = element.id;
      tempWashroom.room_num = element.room_num;
      tempWashroom.floor = element.floor;
      tempWashroom.wheelchair = element.wheelchair;
      tempWashroom.building = element.building;
      listOfWashrooms.push(tempWashroom);
    });
    returnObject.listOfWashrooms = listOfWashrooms;
    response.json(returnObject);
  });

});

// Gets a specific washroom for a ID
// Example Request: http://localhost:3000/washroom?id=HP4125
app.get('/washroom', (request, response) => {
  var returnObj = {};
  var sqlQuery = 'SELECT male,female,average_rating,cleanliness,size,toilet_paper,traffic,id FROM washrooms WHERE id LIKE "%' + request.query.id + '%";';
  db.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      returnObj.male = element.male;
      returnObj.female = element.female;
      returnObj.average_rating = element.average_rating;
      returnObj.cleanliness = element.cleanliness;
      returnObj.size = element.size;
      returnObj.toilet_paper = element.toilet_paper;
      returnObj.traffic = element.traffic;
      returnObj.id = element.id;
      console.log(returnObj);
      response.json(returnObj);
    });
  });
});

// Example: http://localhost:8080/comments?id=HP4125
app.get('/comments', (request, response) => {
  var returnObj = {};
  returnObj.listOfComments = [];
  var innerObj = {};
  var washroomID = request.query.id;
  var sql = 'SELECT user, words, date FROM comments WHERE washroom LIKE "%' + washroomID + '%";';
  commentsDB.all(sql, [], (err, rows) => {
    if(err)
    throw err;
    rows.forEach((element)=>{
      innerObj = {};
      innerObj.username = element.user;
      innerObj.comment = element.words;
      innerObj.date = element.date;
      returnObj.listOfComments.push(innerObj);

    });
    response.json(returnObj);
  });
})

app.post('/sendComments', (request, response) => {
  var returnObj = {};
  var userComment, userName, commentWashroom, date;
  userComment = request.body.comment;
  userName = request.body.user;
  commentWashroom = request.body.washroom;
  var today = new Date();
  date = today.getFullYear() + '-' + today.getMonth()+1 +'-' + today.getDate() +' ' + today.getHours()+ ':'+(today.getMinutes()<10?'0':'')+today.getMinutes()+':'+today.getSeconds();
  try {
    var sqlInsert = commentsDB.prepare('INSERT INTO comments (user, words, date, washroom) VALUES (?,?,?,?);');
    sqlInsert.run(userName, userComment, date, commentWashroom);
    sqlInsert.finalize();
    returnObj.error = false;
    response.json(returnObj);
  } catch (err){
    returnObj.error = true;
    response.json(returnObj);
  }
});

app.post('/sendRatings', (request, response) => {
  var returnObj = {};
  var rating, clean, paper, trafic, numVotes;
  var washroomID = request.query.id;
  var sqlQuery = 'SELECT average_rating,cleanliness,toilet_paper,traffic,num_votes FROM washrooms WHERE id LIKE "%' + request.query.id + '%";';
  db.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      numVotes = element.num_votes;
      rating = element.average_rating;
      clean = element.cleanliness;
      paper = element.toilet_paper;
      traffic = element.traffic;
      rating = ((rating)+((request.body.rating-rating)/(numVotes++))).toFixed(1);
      clean = ((clean)+((request.body.clean-clean)/(numVotes))).toFixed(1);
      paper = ((paper)+((request.body.paper-paper)/(numVotes))).toFixed(1);
      traffic = ((traffic)+((request.body.traffic-traffic)/(numVotes))).toFixed(1);

      var sqlUpdate = 'UPDATE washrooms SET average_rating = ' + rating + ', cleanliness = ' + clean + ', toilet_paper = ' + paper + ',traffic = ' + traffic + ', num_votes = ' + numVotes + ' WHERE id LIKE "%' + request.query.id + '";';
      db.run(sqlUpdate,[],function(err) {
        //console.log(sqlUpdate);
        if (err) {
          return console.error(err.message);
        }
        console.log(`Row(s) updated: ${this.changes}`);
        response.json(returnObj);
      });

    });
  });
});

app.post('/')


app.post('/signup', (request, response) => {
  var returnObj = {};
  var tempUser = request.body.username.toUpperCase();
  var tempPass = request.body.password;
  var sqlQuery = 'SELECT * FROM ' + process.env.LOGIN_DB + ' WHERE ' + process.env.LOGIN_KEY + ' LIKE "%' + tempUser + '%";';
  usersDB.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    if(rows.length != 0){
      returnObj.error = true;
      returnObj.passwordError = "User already exists";
      response.json(returnObj);
    }
    else {
      var goodPass = checkPassword(tempPass);
      var newSalt = genRandomString(16);
      var newPass = sha512(tempPass, newSalt);
      if(goodPass === ('ok')){
        var sqlInsert = usersDB.prepare('INSERT INTO ' + process.env.LOGIN_DB + ' (' + process.env.LOGIN_KEY + ', ' + process.env.LOGIN_TABLE + ', hash) VALUES (?,?,?);');
        sqlInsert.run(tempUser, newPass.passwordHash, newSalt);
        sqlInsert.finalize();
        returnObj.error = false;
        response.json(returnObj);
      }
      else {
        returnObj.error = true;
        returnObj.passwordError = goodPass;
        response.json(returnObj);
      }
    }
  });
});
app.post('/login', (request, response) => {
  var returnObj = {};
  var tempUser = request.body.username.toUpperCase();
  var tempPass = request.body.password;
  var sqlQuery = 'SELECT ' + process.env.LOGIN_TABLE + ', hash FROM ' + process.env.LOGIN_DB + ' WHERE ' + process.env.LOGIN_KEY + ' LIKE "%' + tempUser + '%";';
  usersDB.all(sqlQuery,[],(err,rows)=>{
    if(err)
    throw err;
    rows.forEach((element)=>{
      if(element[process.env.LOGIN_TABLE] == (sha512(tempPass,element.hash).passwordHash))
      returnObj.error = false;
      else
      returnObj.error = true;
      response.json(returnObj);
    });
  });
});

//Returns random salt
function genRandomString(length){
  return crypto.randomBytes(Math.ceil(length/2))
  .toString('hex') /** convert to hexadecimal format */
  .slice(0,length);   /** return required number of characters */
};


function sha512 (password, salt){
  var hash = crypto.createHmac('sha512', salt); /** Hashing algorithm sha512 */
  hash.update(password);
  var value = hash.digest('hex');
  return {
    salt:salt,
    passwordHash:value
  };
};

function checkPassword(password){
  if (password.length < 6) {
    return("Password too short!");
  } else if (password.search(/\d/) == -1) {
    return("Password doesn't contain numbers!");
  } else if (password.search(/[a-zA-Z]/) == -1) {
    return("Password doesn't contain any letters!");
  }
  return("ok");
}



// ==================================================================================

app.listen(PORT, err => {
  if(err) console.log(err)
  else {
    console.log(`Server listening on port: ${PORT}`)
  }
});


module.exports = {


  friendlyName: 'Images GET',


  description: '',


  inputs: {
    originalFilenameLower : {
      type : 'string',
      description : 'Partial match or use * as wildcard for image name'
    },
    labels: {
      type: 'ref',
      description: 'labels to match'
    },
    sourceTask : {
      type : 'string',
      description : 'The source task to copy from'
    },
    startDate : {
      type : 'string',
      description : 'Date from'
    },
    endDate : {
      type : 'string',
      description : 'Date to'
    },
    subsetStart : {
      type : 'number',
      description : 'End of subset'
    },
    subsetEnd : {
      type : 'number',
      description : 'End of subset'
    }
  },

  exits: {
    success: {
      statusCode: 200,
      description: 'Images were found. Details attached.'
    },
    forbidden: {
      statusCode: 403,
      description: 'The user is not allowed to make that request.'
    }
  },

  fn: async function (inputs,exits) {    

    if(!this.req.session.userId){
      return exits.forbidden();
    }

    // @TODO consolidate this logic into a helper and have this controller share with with the taskQueuer worker
    overrideToZero = false;
    let originalFilenameLower = inputs.originalFilenameLower.toLowerCase().trim();

    let query = {};
    if(!originalFilenameLower.includes("*")) {      
      query.originalFilenameLower = {
        contains: originalFilenameLower
      };
    }  
    else {      
      query.originalFilenameLower = {        
         like: originalFilenameLower.replaceAll("*","%")
      };
    }

    let labels = [];
    // what a hassle
    if (inputs.labels) {
        let arr = [];
        if (Array.isArray(inputs.labels)) {
            arr = inputs.labels;
        } else {  // assuming string, sorrynotsorry
            arr.push(inputs.labels);
        }
        for (const label of arr) {
            if (label.length) labels.push(label);
        }
    }

    if(inputs.sourceTask){
      let matchingTasks = await Tasks.find({where : {displayName : inputs.sourceTask}, limit : 1})

      if(matchingTasks.length > 0){
        let taskId = matchingTasks[0].id;
        query.taskIds = [taskId];
      } else {
        overrideToZero = true;
      }

    }

    if(inputs.startDate){
      let start = Date.parse(inputs.startDate);
      query.exifTimestamp = { '>=': start };
    }

    if(inputs.endDate){
      let end = Date.parse(inputs.endDate) + (1000 * 60 * 60 * 24);
      if(typeof(query.exifTimestamp) == 'undefined'){
        query.exifTimestamp = {};
      }
      query.exifTimestamp['<='] = end;
    }

    let cmd = {
      where : query,
      sort : 'exifTimestamp ASC'
    };
    skip = 0
    if(inputs.subsetStart && inputs.subsetStart > 1){
      skip = inputs.subsetStart - 1;
      cmd.skip = skip;
    }


    if(inputs.subsetEnd){
      let limit = inputs.subsetEnd - skip > 0 ? inputs.subsetEnd - skip: 0;
      cmd.limit = limit;

    }



    imageCount = 0;
    if(!overrideToZero){
      let imagesFound = await Images.find(cmd);

      //    FIXME
      // 1. this should probably be a method elsewhere
      // 2. definitely would be better done as part of the query (cmd) above  :(
      if (labels && labels.length) {
        let imagesFoundWithLabels = [];
        for (const image of imagesFound) {
          let annots = await Annotations.find({
            imageId : image.id,
          });
          if (!annots || !annots.length) continue;
          // bummer, label is within boundingBoxes
          checkImage: for (const annot of annots) {
            // finding just one is good enough, cuz this is an "or" search
            for (const bbox of annot.boundingBoxes) {
              if (labels.indexOf(bbox.label) > -1) {
                imagesFoundWithLabels.push(image);
                break checkImage;
              }
            }
          }
        }
        imagesFound = imagesFoundWithLabels;
      }

      imageCount = imagesFound.length;
    }

    return exits.success({
      imageCount : imageCount
    });
  }


};

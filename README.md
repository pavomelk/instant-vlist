This virtual list implementation makes data accessible on the client's page as soon as they arrive. It adequately adjusts to the amount of data during transmission and is capable of handling amount of records in range of many hundreds of thousands. 

Data required to be streamed in [NDJSON](https://en.wikipedia.org/wiki/JSON_streaming) format. Individual items for rendering expected to be more or less of the same size. 

The list exposes basic funcitonality for filtering, searching and navigation without much "sugar". 

Not minified code with all comments in it takes around 30K in size. 
***
##### DISCLAIMER: This code was developed outside GitHub and is posted here "as is" with currently no intention of further extension. At the moment of this writing, the code was tested only on variety of browsers on Windows PC threfore all claims below are limited to the scope of tested environments.

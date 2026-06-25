The idea behind this implementation of virtual list is to make data accessible by client as soon as they arrive. This is particularly useful when completion of data transmission takes longer time and when data size might be large (few hundred thousands or more). 

Data required to be streamed in [NDJSON](https://en.wikipedia.org/wiki/JSON_streaming) format. Individual items for rendering expected to be more or less of the same size. Despite this, the list handles resizing of the viewport and dynamic changes of item size (if all at once).

The list exposes basic funcitonality for filtering, searching and navigation without much "sugar". 

Not minified code with all comments in it takes only 30K in size. 
***
##### DISCLAIMER: This code was developed outside GitHub and is posted here "as is" with currently no intention of further extension. At the moment of this writing, the code was tested only on variety of browsers on Windows PC threfore all claims below are limited to the scope of tested environments.



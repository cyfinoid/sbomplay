## Objective 

A project to upgrade the commandline utility to a web gui based utility. 


## Expected outcome

1. The gui should talk and reference sbom specs etc.
2. It should allow a person to provide an org url and using the publically available api call's we need to identify 
a. the number of projects on github.
b. sbom for as many as we can.
c. store it in a sqlite db container

3. Once it has stored all the sbom's then we want to run a query to extract top dependencies.


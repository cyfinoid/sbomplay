# v3 enhancements : Github actions

Github actions are right now not detailed enough in our environment.

1. for each github action type we can directly go to the github repo and extract out the license in use.
2. simmilrly authors of the repositories can be extracted and appropriately marked as authors. 
3. we right now only look at the github actions that are called in the workflows folder. we can look deeper and identify more patterns in this. 
4. have a look at projects/ghactions-auditor code, it parses the workflow action files and recursively identifies all github action dependencies.
5. In ghactions-auditor we also identify a bunch of github actions related issues. I would like to list them in the @vulns.html under specific finding types as audit findings. we may expand on audit findings a bit more as we progress with this project.  right now the rate of vulnerability stats card serves no purpose so better to remove it and replace it with audit findings. 

feel free to make some curl calls to understand the setup.

## For Testing

https://github.com/cyfinoid/keychecker has multiple workflows which call other workflows.
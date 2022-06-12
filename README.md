# washingtonthree
A progressively loading 3D flythrough of the DC LiDAR 2018 dataset

* Raw Data: https://docs.opendata.aws/dc-lidar-2018/readme.html
* Demo: https://dclidar.space

Subdivides the pointcloud map into tiles that have varying resolution levels that can be viewed at different distances. Approximately 850M
points in this pointcloud can be viewed in chunks based on camera movement -- similar to the way that a map viewer like Google Maps would
handle progressive loading.

<img width="1435" alt="image" src="https://user-images.githubusercontent.com/152084/173240404-dc6ca05e-e2bc-49bd-a505-f155a651f623.png">

Build instructions are fairly simple:
```
$ yarn
$ yarn start
```

The tiles themselves are constructed offline and uploaded to my CDN.
